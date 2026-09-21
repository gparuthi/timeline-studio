// Short links for Timeline Studio.
//
// A long share link carries the whole timeline in its fragment as
// "z=<deflate-raw, base64url>" (see TimelineText.encodeLink). This Worker
// stores that same payload under a short id in KV:
//
//   POST /            body = the payload      -> { id, url }
//   GET  /<id>        the viewer page with the payload inlined
//   GET  /<id>.txt    the timeline text itself
//   GET  /<id>.ics    the same as a calendar feed (also /<name>.ics)
//   PUT  /<name>      body = the payload      -> { url, key? }   named link
//   GET  /<name>      the viewer for whatever that name points to now
//   GET  /resolve?u=  follows a Google/Apple Maps link -> { url, name, address }
//   POST /command     { text, command, today } -> { text, note }   edit by instruction
//
// Ids are content-addressed (a prefix of sha256(payload)), so sharing the
// same timeline twice yields the same link and never a second KV write.
//
// A named link ("link: la-week" in the timeline text) is a mutable alias:
// KV "alias:<name>" holds { id, key }. The first PUT claims the name and
// returns a random key; later PUTs must present it, either as x-link-key
// or inside the text as "link: la-week <key>" (the studio writes it there
// so the owner's other devices can update too). The key is stripped from
// every payload before it is stored, so what a short link serves never
// carries the ability to overwrite it.
// Nothing here is authenticated: anyone can create a link, which is the
// point of a share service. Payloads are capped and validated so KV only
// ever holds something the viewer can decode.

// The renderer's parser, shared with the studio (the file is a
// dependency-free IIFE; bundled here as CommonJS).
import TimelineText from "../../timeline-renderer.js";

const MAX_PAYLOAD = 64 * 1024;
const PAYLOAD = /^(z|t)=[A-Za-z0-9_-]{1,}$/;
const LINK_LINE = /^([ \t]*link[ \t]*:[ \t]*[a-z0-9][a-z0-9-]{1,30}[a-z0-9])[ \t]+([A-Za-z0-9_-]{16,40})[ \t]*$/m;
const ID = /^\/([A-Za-z0-9_-]{7,22})(\.txt|\.ics)?$/;
const ALIAS = /^\/([a-z0-9][a-z0-9-]{1,30}[a-z0-9])(\.txt|\.ics)?$/;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, PUT, GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-link-key",
  "access-control-max-age": "86400",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS")
      // The extra header lets a studio on a LAN/tailnet host talk to a local
      // `wrangler dev` under Chrome's private-network-access rules.
      return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-private-network": "true" } });
    if (url.pathname === "/") {
      if (request.method === "POST") return create(request, env);
      return Response.redirect(env.STUDIO_URL, 302);
    }
    if (url.pathname === "/resolve" && request.method === "GET") return resolveMap(url.searchParams.get("u") || "");
    if (url.pathname === "/command" && request.method === "POST") return command(request, env);
    const alias = url.pathname.match(ALIAS);
    if (alias && request.method === "PUT") return claim(request, env, alias[1]);
    const match = url.pathname.match(ID) || alias;
    if (!match || (request.method !== "GET" && request.method !== "HEAD"))
      return new Response("Not found", { status: 404, headers: CORS });
    // A name resolves through its alias record; a content id is immutable
    // and may be cached, a name must always show the latest edit.
    let payload = null,
      cache = "public, max-age=86400";
    if (alias) {
      const record = await env.LINKS.get("alias:" + alias[1], "json");
      if (record) {
        payload = await env.LINKS.get(record.id);
        cache = "no-store";
      }
    }
    if (!payload && url.pathname.match(ID)) payload = await env.LINKS.get(url.pathname.match(ID)[1]);
    if (!payload) return page(notFound(env), 404);
    if (match[2]) {
      const text = await decode(payload);
      if (match[2] === ".ics")
        return new Response(calendar(text, match[1], `${url.origin}/${match[1]}`), {
          headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": cache, ...CORS },
        });
      return new Response(text, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": cache, ...CORS },
      });
    }
    return page(await viewer(payload, match[1], env), 200, { "cache-control": cache });
  },
};

async function readPayload(request) {
  if (Number(request.headers.get("content-length")) > MAX_PAYLOAD) throw new HttpError(413, "Timeline too large");
  const payload = (await request.text()).trim();
  if (payload.length > MAX_PAYLOAD) throw new HttpError(413, "Timeline too large");
  if (!PAYLOAD.test(payload)) throw new HttpError(400, "Expected a timeline link payload (z=… or t=…)");
  let text;
  try {
    text = await decode(payload);
  } catch (error) {
    throw new HttpError(400, "Payload does not decode");
  }
  if (!text.trim()) throw new HttpError(400, "Empty timeline");
  // Never store or serve an edit key: drop it from the link line.
  const keyed = text.match(LINK_LINE);
  if (keyed) {
    const stripped = text.replace(LINK_LINE, "$1");
    return { payload: await encode(stripped), text: stripped, textKey: keyed[2] };
  }
  return { payload, text, textKey: "" };
}

async function encode(text) {
  const bytes = new TextEncoder().encode(text);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return "z=" + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

// Content-addressed store: the same timeline always gets the same id. On
// the (astronomically unlikely) prefix collision, take a longer prefix.
async function store(env, payload, text) {
  const digest = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))));
  for (const length of [7, 10, 14, 22]) {
    const candidate = digest.slice(0, length);
    const existing = await env.LINKS.get(candidate);
    if (existing === null) {
      await env.LINKS.put(candidate, payload, { metadata: { created: new Date().toISOString(), title: title(text) } });
      return candidate;
    }
    if (existing === payload) return candidate;
  }
  throw new HttpError(500, "Could not allocate an id");
}

async function claim(request, env, name) {
  try {
    const { payload, text, textKey } = await readPayload(request);
    const record = await env.LINKS.get("alias:" + name, "json");
    const key = request.headers.get("x-link-key") || textKey || "";
    if (record && record.key !== key) throw new HttpError(403, `“${name}” is already taken`);
    if (!record && (await env.LINKS.get(name)) !== null) throw new HttpError(409, `“${name}” is not available`);
    const id = await store(env, payload, text);
    const now = new Date().toISOString();
    const next = record
      ? { ...record, id, updated: now }
      : { id, key: b64url(crypto.getRandomValues(new Uint8Array(18))), created: now, updated: now };
    await env.LINKS.put("alias:" + name, JSON.stringify(next), { metadata: { title: title(text), updated: now } });
    const link = new URL("/" + name, request.url);
    if (link.hostname !== "localhost") link.protocol = "https:";
    return json(record ? { url: link.href, id } : { url: link.href, id, key: next.key, created: true });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    throw error;
  }
}

// Map short links (maps.app.goo.gl) only reveal the place after a redirect
// the browser cannot follow cross-origin, so the studio asks here. Only map
// hosts are fetched, and only the final URL's place text is returned.
const MAP_HOSTS = /^(?:maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|(?:www\.)?google\.[a-z.]+|maps\.apple\.com)$/i;
async function resolveMap(raw) {
  let target;
  try {
    target = new URL(raw);
  } catch (error) {
    return json({ error: "Not a URL" }, 400);
  }
  if (!/^https?:$/.test(target.protocol) || !MAP_HOSTS.test(target.hostname)) return json({ error: "Not a map link" }, 400);
  let final;
  try {
    const response = await fetch(target.href, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (timeline-studio link resolver)" },
    });
    final = new URL(response.url || target.href);
  } catch (error) {
    return json({ error: "Could not reach the map service" }, 502);
  }
  const place = placeFromMapUrl(final);
  return json({ url: final.href, ...place }, 200, { "cache-control": "public, max-age=604800" });
}

function placeFromMapUrl(url) {
  const decode = (s) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, " ")).trim();
    } catch (error) {
      return s;
    }
  };
  let text =
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    url.searchParams.get("destination") ||
    url.searchParams.get("address") ||
    "";
  if (!text) {
    const m = url.pathname.match(/\/maps\/(?:place|search|dir)\/([^/@]+)/);
    if (m) text = decode(m[1]);
  } else text = decode(text);
  text = text.replace(/\s+/g, " ").trim();
  if (!text || /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(text)) return { name: "", address: "" };
  const [name, ...rest] = text.split(/,\s*/);
  return { name, address: rest.join(", ") };
}

// Edit a timeline from an instruction ("move golf to 3 pm", "add dinner
// with Sam on Friday at 7"). The model gets the whole text and returns the
// whole text: timelines are a few hundred tokens, so that is cheaper and
// far easier to validate than a diff. The studio parses the answer before
// applying it and keeps the previous text for Undo. Nothing is stored here.
const MAX_COMMAND = 600;
const MAX_COMMAND_TEXT = 16 * 1024;
const COMMAND_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const ASSET_LINE = /^[ \t]*asset[ \t]+[^:\n]+:[ \t]*data:.*$/gm;
const COMMAND_PROMPT = `You edit a text timeline. The user gives the current timeline and one instruction; you return the complete updated timeline.

Format, one item per line:
- Header lines: "title:", "subtitle:", "date:", "theme:", "link:", "footer:", "header-art:". Keep them exactly as they are.
- "day: Weekday, Mon D, YYYY" starts a day. The lines after it belong to that day until the next "day:". Keep days in chronological order; add a "day:" line when the instruction needs a day that is not there yet.
- "range: HH:MM - HH:MM" under a day sets its visible hours. "note: ..." adds a note.
- Events: "HH:MM | title | description | icon | color". Only the time and title are required; leave the other fields empty rather than inventing them. Time can be a span "HH:MM - HH:MM". Use 24-hour times.
- Icons: home, plane, depart, land, coffee, meal, tree, bed, shop, ticket, pin, car, road, palm. Colors: sky, sand, sage. Leave the icon empty to let it be guessed.
- Lines starting with # are comments.

Rules:
- Change only what the instruction asks. Every other line stays byte-for-byte the same, in the same order within its day.
- Changing an event's time means rewriting the HH:MM at the start of its line (and both ends of a span). Moving it to another day means cutting the line and pasting it under that day. Keep its title, description, icon and color.
- A time without AM/PM takes the reading closest to the event's current time and to what the event is: dinner at 7:30 is 19:30, coffee at 9 is 09:00, "3 pm" is 15:00.
- Keep events under each day sorted by time.
- "Today" and "tomorrow" are relative to the date given with the instruction.
- If the instruction cannot be applied or is ambiguous, return the timeline unchanged and explain in the note.

Answer with the full timeline inside one fenced block:
\`\`\`timeline
...
\`\`\`
After the block, optionally one line starting with "Note:" for anything the user should know. No other text.`;

async function command(request, env) {
  try {
    if (env.COMMANDS) {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const { success } = await env.COMMANDS.limit({ key: ip });
      if (!success) throw new HttpError(429, "Too many commands, try again in a minute");
    }
    if (Number(request.headers.get("content-length")) > MAX_COMMAND_TEXT + MAX_COMMAND + 1024)
      throw new HttpError(413, "Timeline too large");
    let body;
    try {
      body = await request.json();
    } catch (error) {
      throw new HttpError(400, "Expected JSON { text, command }");
    }
    const instruction = String(body.command || "").trim();
    const text = String(body.text || "").replace(/\r\n?/g, "\n");
    const today = String(body.today || "").slice(0, 60);
    if (!instruction) throw new HttpError(400, "Say what to change");
    if (instruction.length > MAX_COMMAND) throw new HttpError(400, "Keep a command under 600 characters");
    if (text.length > MAX_COMMAND_TEXT) throw new HttpError(413, "Timeline too large for a command (embedded images count)");
    // Embedded images and the edit key never reach the model: an asset line
    // is thousands of tokens of base64 it would mangle, and the key is a
    // secret. Both go back in afterwards.
    const assets = text.match(ASSET_LINE) || [];
    const keyed = text.match(LINK_LINE);
    const trimmed = text.replace(ASSET_LINE, "").replace(LINK_LINE, "$1").replace(/\n{3,}/g, "\n\n").trim();
    if (!trimmed) throw new HttpError(400, "Empty timeline");
    const answer = await env.AI.run(COMMAND_MODEL, {
      messages: [
        { role: "system", content: COMMAND_PROMPT },
        {
          role: "user",
          content: `Today is ${today || "unknown"}.\n\nTimeline:\n\`\`\`timeline\n${trimmed}\n\`\`\`\n\nInstruction: ${instruction}`,
        },
      ],
      temperature: 0.2,
      // Qwen3 reasons before it answers (a hidden <think> block). With the
      // reasoning suppressed it passed 6 of 8 eval commands and got times
      // wrong ("dinner at 7:30" -> 17:30); with it, 8 of 8 at ~5.5 s. The
      // budget covers the reasoning plus a full day-by-day rewrite.
      max_tokens: Math.min(8000, Math.ceil(trimmed.length / 2) + 2500),
    });
    const raw = String(answer?.response ?? answer?.result?.response ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
    const block = raw.match(/```(?:timeline|text)?[ \t]*\n([\s\S]*?)\n?```/);
    if (!block) throw new HttpError(502, "The model did not return a timeline" + (raw.trim() ? ": " + raw.trim().slice(0, 240) : ""));
    let edited = block[1].replace(/[ \t]+$/gm, "").trim();
    if (keyed) edited = /^[ \t]*link[ \t]*:/m.test(edited) ? edited.replace(/^[ \t]*link[ \t]*:.*$/m, keyed[0].trim()) : keyed[0].trim() + "\n" + edited;
    if (assets.length) edited += "\n\n" + assets.join("\n");
    const note = (raw.slice(raw.indexOf(block[0]) + block[0].length).match(/^\s*note:\s*(.+)$/im) || [])[1] || "";
    return json({ text: edited + "\n", note: note.trim().slice(0, 300), model: COMMAND_MODEL });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "Command failed: " + (error.message || error) }, 502);
  }
}

// iCalendar feed of a timeline, for "subscribe from URL" in Google or iOS
// Calendar. Each event is emitted as a UTC instant, converted from the
// written wall-clock time in the timeline's "timezone:" (a day's own
// "timezone:" wins; Pacific when none is given): Google reads floating
// times as UTC, so they have to be pinned to a zone. An event without
// an end runs an hour, or until the next event if that comes sooner. UIDs
// are built from the name, day, time and title, so an unchanged event keeps
// its identity across edits. Undated days cannot be scheduled and are left
// out.
const DEFAULT_ZONE = "America/Los_Angeles";
// UTC instant for a wall-clock time in an IANA zone, as an iCalendar
// "YYYYMMDDTHHMMSSZ" string. Two passes settle the offset across a DST edge.
function utcStamp(iso, minutes, zone) {
  const [y, m, d] = iso.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  const offsetAt = (ms) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
        .formatToParts(new Date(ms))
        .map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms;
  };
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return new Date(utc).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

function calendar(text, name, link) {
  const model = TimelineText.parse(text);
  const esc = (s) =>
    String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Timeline Studio//tl.gaup.uk//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(model.title || name)}`,
    `X-WR-TIMEZONE:${model.timezone || DEFAULT_ZONE}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const day of model.days) {
    if (!day.iso) continue;
    const zone = day.timezone || model.timezone || DEFAULT_ZONE;
    day.events.forEach((event, i) => {
      const next = day.events[i + 1],
        end = event.end || Math.min(event.minutes + 60, next && next.minutes > event.minutes ? next.minutes : Infinity),
        slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40),
        url = (event.detail.match(/https?:\/\/\S+/) || [])[0] || "",
        // The text before a map link is the place: "REI · 1900 Empire Ave …"
        // as the studio writes it, or the user's own "Pick up the hat ·
        // 1900 Empire Ave". Keep the address-looking parts (with a digit),
        // or everything when nothing looks like an address.
        parts = url ? event.detail.slice(0, event.detail.indexOf(url)).split(/\s+[·|]\s+/).map((p) => p.trim()).filter(Boolean) : [],
        place = (parts.filter((p) => /\d/.test(p)).length ? parts.filter((p) => /\d/.test(p)) : parts).join(", ");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${name}-${day.iso}-${String(event.minutes).padStart(4, "0")}-${slug}@tl.gaup.uk`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${utcStamp(day.iso, event.minutes, zone)}`,
        `DTEND:${utcStamp(day.iso, end, zone)}`,
        `SUMMARY:${esc(event.title)}`,
      );
      if (event.detail) lines.push(`DESCRIPTION:${esc(event.detail)}`);
      if (place) lines.push(`LOCATION:${esc(place)}`);
      lines.push(`URL:${url || link}`, "END:VEVENT");
    });
  }
  lines.push("END:VCALENDAR");
  // Content lines fold at 75 octets (RFC 5545), continued with one space.
  const encoder = new TextEncoder();
  return (
    lines
      .map((line) => {
        const out = [];
        let chunk = "";
        for (const char of line) {
          if (encoder.encode(chunk + char).length > (out.length ? 74 : 75)) {
            out.push(chunk);
            chunk = "";
          }
          chunk += char;
        }
        out.push(chunk);
        return out.join("\r\n ");
      })
      .join("\r\n") + "\r\n"
  );
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function create(request, env) {
  try {
    const { payload, text } = await readPayload(request);
    const id = await store(env, payload, text);
    const link = new URL("/" + id, request.url);
    if (link.hostname !== "localhost") link.protocol = "https:";
    return json({ id, url: link.href });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    throw error;
  }
}

async function viewer(payload, id, env) {
  const text = await decode(payload).catch(() => "");
  const name = title(text) || "Timeline";
  const studio = env.STUDIO_URL;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#101418">
<meta name="robots" content="noindex">
<meta property="og:title" content="${escape(name)}">
<meta property="og:description" content="${escape(summary(text))}">
<meta property="og:type" content="website">
<link rel="icon" href="${studio}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${studio}apple-touch-icon.png">
<title>${escape(name)}</title>
<style>
:root{color-scheme:dark}
html,body{margin:0;background:#0f1418;color:#dfebf2;font-family:system-ui,-apple-system,sans-serif}
.msg{max-width:520px;margin:18vh auto;padding:0 24px;text-align:center;line-height:1.5}
.msg a{color:#8fc7dd}
</style>
</head>
<body>
<p class="msg">Loading timeline…</p>
<script src="${studio}timeline-renderer.js"></script>
<script>
(async () => {
  const payload = ${JSON.stringify(payload)}, studio = ${JSON.stringify(studio)};
  const message = document.querySelector(".msg");
  try {
    if (typeof TimelineText === "undefined") throw new Error("The timeline renderer did not load.");
    const text = await TimelineText.decodeLink(payload);
    const html = TimelineText.render(TimelineText.parse(text));
    document.open();
    document.write(html);
    document.close();
    // document.open() dropped every window listener; a second link tapped
    // into this tab must still trigger a fresh load.
    window.addEventListener("hashchange", () => location.reload());
    // Tapping a card opens the studio on that line, like the live preview.
    document.head.insertAdjacentHTML("beforeend", "<style>[data-line]{cursor:pointer}</style>");
    document.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      const target = event.target.closest("[data-line]");
      if (target) location.href = studio + "?line=" + target.dataset.line + "#" + payload;
    });
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="' + studio + "#" + payload + '" style="position:fixed;right:14px;bottom:max(14px,env(safe-area-inset-bottom));z-index:28;padding:9px 14px;border-radius:999px;background:#143e55;color:#fff;font:600 13px system-ui,-apple-system,sans-serif;text-decoration:none;opacity:.85;box-shadow:0 4px 18px #0004">✎ Edit</a>'
    );
  } catch (error) {
    message.innerHTML = "";
    message.append(error.message, document.createElement("br"));
    const link = document.createElement("a");
    link.href = studio + "#" + payload;
    link.textContent = "Open in Timeline Studio";
    message.append(link);
  }
})();
</script>
</body>
</html>`;
}

function notFound(env) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No such timeline</title><style>:root{color-scheme:dark}html,body{margin:0;background:#0f1418;color:#dfebf2;font-family:system-ui,-apple-system,sans-serif}.msg{max-width:520px;margin:18vh auto;padding:0 24px;text-align:center;line-height:1.5}.msg a{color:#8fc7dd}</style></head><body><p class="msg">There is no timeline at this link.<br><a href="${escape(env.STUDIO_URL)}">Open Timeline Studio</a></p></body></html>`;
}

async function decode(payload) {
  const [kind, data] = [payload[0], payload.slice(2)];
  const bytes = Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  if (kind === "t") return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function title(text) {
  const match = String(text).match(/^\s*title\s*:\s*(.+)$/m);
  return match ? match[1].trim().slice(0, 120) : "";
}

function summary(text) {
  const lines = String(text).split(/\r?\n/);
  const date = lines.find((line) => /^\s*date\s*:/.test(line));
  const events = lines.filter((line) => /^\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:[-–+][^|]*)?\|/i.test(line)).length;
  const parts = [];
  if (date) parts.push(date.replace(/^\s*date\s*:\s*/, "").trim());
  parts.push(`${events} event${events === 1 ? "" : "s"}`);
  return parts.join(" · ").slice(0, 200);
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function page(html, status = 200, extra = {}) {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", ...extra } });
}
