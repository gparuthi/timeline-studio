// Timeline Studio's server: the URL is the document.
//
//   GET  /                the studio, a fresh timeline
//   GET  /<name>          the studio open on that timeline (the text is
//                         inlined; og: tags for message previews)
//   PUT  /<name>          body = link payload (z=… / t=…); stores the text
//                         under the name. "If-None-Match: *" makes it a
//                         create that fails with 412 when the name exists.
//   GET  /<name>.txt      the text          GET /<name>.ics   calendar feed
//   GET  /<name>.mobileconfig  an Apple configuration profile that adds the
//                         CalDAV account (tap it on an iPhone or Mac)
//   /dav/<name>/          CalDAV: calendar apps edit the events (caldav.js)
//   GET  /resolve?u=      follows a Google/Apple Maps link -> { url, name, address }
//   POST /command         { text, command, today } -> { text, note }   edit by instruction
//   GET  /<id>            a snapshot from the earlier content-addressed
//                         scheme, opened in the studio read-only-until-edited
//
// A name is the whole capability: anyone with the link can read and edit,
// like a shared document. Names the studio makes up carry a random tail
// (la-week-k3x9p); a name you choose is as guessable as you make it.
// Nothing is authenticated beyond that, and nothing carries an edit key.
// The studio and its files are this Worker's static assets (wrangler.jsonc).

import TimelineText from "../../timeline-renderer.js";
import { isDavRequest, handleDav } from "./caldav.js";

const MAX_PAYLOAD = 64 * 1024;
const PAYLOAD = /^(z|t)=[A-Za-z0-9_-]{1,}$/;
const LINK_LINES = /^[ \t]*link[ \t]*:.*(?:\r?\n|$)/gm;
const NAME = /^\/([a-z0-9][a-z0-9-]{1,30}[a-z0-9])(\.txt|\.ics|\.mobileconfig)?$/;
const ID = /^\/([A-Za-z0-9_-]{7,22})(\.txt|\.ics)?$/;
// Names that would shadow a studio file or an endpoint on this origin.
const RESERVED = new Set(["dav", "claim", "index", "view", "themes", "vendor", "worker", "command", "resolve", "example", "icon", "icon-512", "apple-touch-icon", "manifest", "assets", "api"]);
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, PUT, GET, OPTIONS",
  "access-control-allow-headers": "content-type, if-none-match",
  "access-control-expose-headers": "etag",
  "access-control-max-age": "86400",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // CalDAV lives under /dav (see caldav.js); calendar apps also probe
    // /.well-known/caldav and send PROPFIND/OPTIONS at the root.
    if (isDavRequest(url, request.method) && !(request.method === "OPTIONS" && request.headers.get("origin")))
      return handleDav(request, env, { loadDoc, saveDoc });
    if (request.method === "OPTIONS")
      // The extra header lets a studio on a LAN/tailnet host talk to a local
      // `wrangler dev` under Chrome's private-network-access rules.
      return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-private-network": "true" } });
    if (url.pathname === "/") return studio(env, url, null);
    if (url.pathname === "/resolve" && request.method === "GET") return resolveMap(url.searchParams.get("u") || "");
    if (url.pathname === "/command" && request.method === "POST") return command(request, env);
    if (url.pathname === "/places" && request.method === "POST") return places(request, env);
    const named = url.pathname.match(NAME);
    if (named && request.method === "PUT") return put(request, env, named[1]);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Not found", { status: 404, headers: CORS });
    if (named) {
      const doc = await loadDoc(env, named[1]);
      if (named[2] === ".txt") {
        if (!doc) return new Response("No such timeline", { status: 404, headers: CORS });
        // Pollers send the version they have; unchanged costs no body.
        if (request.headers.get("if-none-match") === `"${doc.version}"`)
          return new Response(null, { status: 304, headers: { etag: `"${doc.version}"`, "cache-control": "no-store", ...CORS } });
        return plain(doc.text, "no-store", doc.version);
      }
      if (named[2] === ".ics")
        return doc
          ? new Response(calendar(doc.text, named[1], `${url.origin}/${named[1]}`), {
              headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store", ...CORS },
            })
          : new Response("No such timeline", { status: 404, headers: CORS });
      if (named[2] === ".mobileconfig")
        return doc
          ? new Response(await profile(doc, named[1], url.hostname), {
              headers: {
                "content-type": "application/x-apple-aspen-config; charset=utf-8",
                "content-disposition": `attachment; filename="${named[1]}.mobileconfig"`,
                "cache-control": "no-store",
                ...CORS,
              },
            })
          : new Response("No such timeline", { status: 404, headers: CORS });
      // A name nobody has used yet opens as a fresh timeline bound to it.
      return studio(env, url, { name: named[1], text: doc ? doc.text : null, version: doc ? doc.version : "" });
    }
    const snapshot = url.pathname.match(ID);
    if (snapshot) {
      const payload = await env.LINKS.get(snapshot[1]);
      if (!payload) return page(notFound(env), 404);
      const text = await decode(payload);
      if (snapshot[2] === ".txt") return plain(text, "public, max-age=86400");
      if (snapshot[2] === ".ics")
        return new Response(calendar(text, snapshot[1], `${url.origin}/${snapshot[1]}`), {
          headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=86400", ...CORS },
        });
      return studio(env, url, { name: "", text, snapshot: true });
    }
    return page(notFound(env), 404);
  },
};

function plain(text, cache = "no-store", version = "") {
  return new Response(text, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": cache, ...(version ? { etag: `"${version}"` } : {}), ...CORS },
  });
}

// ---- documents ------------------------------------------------------------

// "doc:<name>" holds the link payload; the version is a hash of it. Names
// from before this scheme ("alias:<name>" -> { id } pointing at a content
// key) are read through and copied over on first use.
async function loadDoc(env, name) {
  let payload = await env.LINKS.get("doc:" + name);
  if (payload === null) {
    const record = await env.LINKS.get("alias:" + name, "json");
    payload = record && (await env.LINKS.get(record.id));
    if (!payload) return null;
    await env.LINKS.put("doc:" + name, payload, { metadata: { migrated: new Date().toISOString() } });
  }
  const text = await decode(payload);
  return { name, text, payload, version: await version(payload) };
}

async function saveDoc(env, name, text) {
  const clean = text.replace(LINK_LINES, "").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  TimelineText.parse(clean); // never store something the studio cannot open
  const payload = await encode(clean);
  await env.LINKS.put("doc:" + name, payload, { metadata: { title: title(clean), updated: new Date().toISOString() } });
  return { name, text: clean, payload, version: await version(payload) };
}

async function version(payload) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return b64url(new Uint8Array(digest)).slice(0, 12);
}

async function put(request, env, name) {
  try {
    if (RESERVED.has(name)) throw new HttpError(409, `“${name}” is reserved`);
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
    if (request.headers.get("if-none-match") === "*" && (await loadDoc(env, name)))
      throw new HttpError(412, `“${name}” is already taken`);
    const doc = await saveDoc(env, name, text);
    const link = new URL("/" + name, request.url);
    if (link.hostname !== "localhost") link.protocol = "https:";
    return json({ url: link.href, version: doc.version }, 200, { etag: `"${doc.version}"` });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: error.message || String(error) }, 400);
  }
}

// An Apple configuration profile (unsigned) carrying the CalDAV account:
// opened on an iPhone or Mac it offers to install, and the calendar app
// then has the timeline with nothing to type. UUIDs derive from the name
// so installing again updates the same profile instead of adding one.
async function profile(doc, name, host) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("caldav:" + name)));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const uuid = (offset) => `${hex.slice(offset, offset + 8)}-${hex.slice(offset + 8, offset + 12)}-${hex.slice(offset + 12, offset + 16)}-${hex.slice(offset + 16, offset + 20)}-${hex.slice(offset + 20, offset + 32)}`;
  const label = title(doc.text) || name;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>CalDAVAccountDescription</key>
      <string>${escape(label)}</string>
      <key>CalDAVHostName</key>
      <string>${escape(host)}</string>
      <key>CalDAVPort</key>
      <integer>443</integer>
      <key>CalDAVUseSSL</key>
      <true/>
      <key>CalDAVPrincipalURL</key>
      <string>/dav/${escape(name)}/</string>
      <key>CalDAVUsername</key>
      <string>${escape(name)}</string>
      <key>CalDAVPassword</key>
      <string>timeline</string>
      <key>PayloadDescription</key>
      <string>Adds the “${escape(label)}” timeline as an editable calendar.</string>
      <key>PayloadDisplayName</key>
      <string>${escape(label)} (Timeline Studio)</string>
      <key>PayloadIdentifier</key>
      <string>uk.gaup.tl.caldav.${escape(name)}</string>
      <key>PayloadType</key>
      <string>com.apple.caldav.account</string>
      <key>PayloadUUID</key>
      <string>${uuid(0)}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Timeline Studio calendar account for ${escape(host)}/${escape(name)}. Edits made in the calendar app change the timeline.</string>
  <key>PayloadDisplayName</key>
  <string>${escape(label)} (Timeline Studio)</string>
  <key>PayloadIdentifier</key>
  <string>uk.gaup.tl.${escape(name)}</string>
  <key>PayloadOrganization</key>
  <string>Timeline Studio</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${uuid(32)}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

// The studio page with the document inlined: no second request, no flash
// of the sample, and og: tags so a pasted link previews as the timeline.
async function studio(env, url, doc) {
  const asset = await env.ASSETS.fetch(new Request(new URL("/index.html", url)));
  let html = await asset.text();
  if (doc) {
    const inline = JSON.stringify(doc).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
    html = html.replace('<script type="application/json" id="doc">null</script>', `<script type="application/json" id="doc">${inline}</script>`);
    if (doc.text) {
      const name = title(doc.text) || "Timeline";
      html = html.replace(
        /<title>[^<]*<\/title>/,
        `<title>${escape(name)}</title><meta property="og:title" content="${escape(name)}"><meta property="og:description" content="${escape(summary(doc.text))}"><meta property="og:type" content="website"><meta name="robots" content="noindex">`,
      );
    }
  }
  return page(html, 200, { "cache-control": doc ? "no-store" : "public, max-age=0, must-revalidate" });
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
- Header lines: "title:", "subtitle:", "date:", "theme:", "timezone:", "city:", "places:", "footer:", "header-art:". Keep them exactly as they are.
- "day: Weekday, Mon D, YYYY" starts a day. The lines after it belong to that day until the next "day:". Keep days in chronological order; add a "day:" line when the instruction needs a day that is not there yet.
- "range: HH:MM - HH:MM" under a day sets its visible hours. "note: ..." adds a note.
- Events: "HH:MM | title | description | icon | color". Only the time and title are required; leave the other fields empty rather than inventing them. Time can be a span "HH:MM - HH:MM". Use 24-hour times.
- Icons: home, plane, depart, land, coffee, meal, tree, bed, shop, ticket, pin, car, road, palm. Colors: sky, sand, sage. Leave the icon empty to let it be guessed.
- A place goes at the end of the description after " @ ": "Gear run @ REI Baldwin Hills", or just "@ Wi Spa" when there is nothing else to say. It becomes a map link by itself, so never write addresses or URLs. When the instruction names a place for an event, add it this way.
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

// Places, filled in: the events that name a venue but carry no "@ place"
// get one. The model sees the whole text and returns the whole text, but
// only one shape of change is accepted per line, " @ place" appended to
// the description of an event that had neither a place nor a link, so a
// wrong answer can at worst add a place, never rewrite the day.
const PLACES_PROMPT = `You add map places to a text timeline. Events are lines "HH:MM | title | description | icon | color" (the time may be a span "HH:MM - HH:MM"). Other lines are settings, day headings, notes and comments.

For each event, decide whether its title or description names a specific place someone could search on a map: a business, restaurant, cafe, bar, shop, park, beach, trail, museum, venue, stadium, station, airport, a hotel by name, a landmark, a named neighborhood spot. If it does, and the line has no "@" and no URL yet, append " @ " and the place to the description field:
"09:30 | Griffith Observatory | Hike up, skip the parking | pin | sky" becomes
"09:30 | Griffith Observatory | Hike up, skip the parking @ Griffith Observatory | pin | sky"
A line with an empty or missing description gets the place as its description: "11:00 | Wi Spa" becomes "11:00 | Wi Spa | @ Wi Spa", and "12:00 | Getty Center | | ticket" becomes "12:00 | Getty Center | @ Getty Center | ticket". Never write a placeholder such as "@ Place" or "@ TBD": either a real place name from that line, or no change.
Write the place the way a map lists it: proper capitalisation, its common name, a misspelling corrected ("wii spa" -> "Wi Spa"), plus the neighborhood or town when the text gives one ("REI in Baldwin Hills" -> "REI Baldwin Hills", "the Getty" -> "Getty Center"). Do not add the city; a "city:" line covers that. Named beaches, parks, scenic roads and viewpoints count ("Manhattan Beach", "Mulholland Drive", "Griffith Park"). When the title and the description name different places, use the description's, it is the more specific one. Airports count ("LAX").

Leave alone: events with no specific place ("Drive home", "Coffee and pastries", "Lunch", "Pack", "Leave for the airport", "Hotel check-in" without a hotel name, "Beach" without which beach), destinations that are a person's home or a town rather than a venue ("start for Rajan's", "head to Culver City", "Culver's"), and every line that already has an "@" or a link. Use only the words of that line: never take a place from another line, and never guess a venue that is not named. When in doubt, leave the line alone.

Change nothing else: every other character of every line stays exactly the same, the same lines in the same order, no lines added or removed. Answer with the full timeline inside one fenced block and nothing else:
\`\`\`timeline
...
\`\`\``;

const FIELD_SPLIT = /(?<!\\)\|/;
// Keep only the allowed edits: for a candidate line (an event without a
// place or a link), the same fields with " @ place" appended to the
// description. Returns the accepted text and the places added.
export function acceptPlaces(original, edited, candidates) {
  const before = original.split("\n"),
    after = edited.split("\n");
  if (before.length !== after.length) return { text: original, added: [], rejected: "line count" };
  const added = [];
  const out = before.map((old, i) => {
    const next = after[i];
    if (next === old) return old;
    if (!candidates.has(i + 1)) return old;
    const a = old.split(FIELD_SPLIT).map((f) => f.trim()),
      b = next.split(FIELD_SPLIT).map((f) => f.trim());
    if (b.length < 3 || b.length > 5 || b.length < a.length || b.length > Math.max(a.length, 3)) return old;
    for (let k = 0; k < b.length; k++) {
      if (k === 2) continue;
      if ((a[k] || "") !== (b[k] || "")) return old;
    }
    const detail = a[2] || "",
      place = b[2].startsWith(detail) ? b[2].slice(detail.length).replace(/^\s*@\s*/, "").trim() : "";
    if (!place || place.length > 80 || /https?:\/\/|[@|]/.test(place)) return old;
    if (!grounded(place, `${a[1]} ${detail}`)) return old;
    if (b[2] !== (detail ? `${detail} @ ${place}` : `@ ${place}`)) return old;
    added.push({ line: i + 1, title: a[1], place });
    // Rebuild from the original line so spacing outside the field is kept.
    const raw = old.split(FIELD_SPLIT);
    if (raw.length > 2) raw[2] = detail ? raw[2].replace(/\s*$/, "") + ` @ ${place}` + (raw.length > 3 ? " " : "") : ` @ ${place}` + (raw.length > 3 ? " " : "");
    else {
      raw[raw.length - 1] = raw[raw.length - 1].replace(/\s*$/, " ");
      raw.push(` @ ${place}`);
    }
    return raw.join("|");
  });
  return { text: out.join("\n"), added };
}

// A place is accepted only when it comes from the line's own words: each
// word of it (3+ letters) appears in the title or description, or is one
// edit away from a word there ("wii spa" -> "Wi Spa"). Placeholders and
// invented venues fail this.
const PLACEHOLDER = /^(place|places|venue|location|here|there|tbd|unknown|n\/a)$/i;
// Words that name a kind of place, not a place: they may fill out a name
// ("the Getty" -> "Getty Center") but cannot carry one ("@ Airport").
const GENERIC = new Set("airport hotel home house beach park parks restaurant cafe coffee bar pub office station gym school store shop mall market spa pool museum church temple library downtown city town center centre apartment airbnb pier plaza square garden gardens trail road drive street avenue boulevard club course golf lake river bay point hill hills canyon valley village".split(" "));
function grounded(place, line) {
  if (PLACEHOLDER.test(place.trim())) return false;
  const words = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").split(/\s+/).filter((w) => w.length >= 2);
  const have = words(line),
    lower = line.toLowerCase();
  const near = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  };
  const placeWords = words(place);
  if (!placeWords.length) return false;
  const matched = (w) => lower.includes(w) || have.some((h) => near(h, w) || (h.length >= 4 && w.startsWith(h.slice(0, 4))));
  let distinctive = false;
  for (const w of placeWords) {
    if (matched(w)) {
      if (!GENERIC.has(w)) distinctive = true;
    } else if (!GENERIC.has(w)) return false;
  }
  return distinctive;
}

async function places(request, env) {
  try {
    if (env.COMMANDS) {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const { success } = await env.COMMANDS.limit({ key: ip });
      if (!success) throw new HttpError(429, "Too many requests, try again in a minute");
    }
    if (Number(request.headers.get("content-length")) > MAX_COMMAND_TEXT + 1024) throw new HttpError(413, "Timeline too large");
    let body;
    try {
      body = await request.json();
    } catch (error) {
      throw new HttpError(400, "Expected JSON { text }");
    }
    const text = String(body.text || "").replace(/\r\n?/g, "\n");
    if (text.length > MAX_COMMAND_TEXT) throw new HttpError(413, "Timeline too large (embedded images count)");
    const assets = text.match(ASSET_LINE) || [];
    const trimmed = text.replace(ASSET_LINE, "").replace(LINK_LINES, "").replace(/\n{3,}/g, "\n\n").trim();
    if (!trimmed) throw new HttpError(400, "Empty timeline");
    const model = TimelineText.parse(trimmed);
    const candidates = new Set(
      model.places === "off" ? [] : model.events.filter((e) => !e.place && !/https?:\/\//.test(e.detail)).map((e) => e.line),
    );
    const finish = (edited, added, note) => json({ text: edited + (assets.length ? "\n\n" + assets.join("\n") : "") + "\n", added, note, model: COMMAND_MODEL });
    if (!candidates.size) return finish(trimmed, [], "");
    const answer = await env.AI.run(COMMAND_MODEL, {
      messages: [
        { role: "system", content: PLACES_PROMPT },
        { role: "user", content: `Timeline:\n\`\`\`timeline\n${trimmed}\n\`\`\`` },
      ],
      temperature: 0.1,
      max_tokens: Math.min(8000, Math.ceil(trimmed.length / 2) + 2500),
    });
    const raw = String(answer?.response ?? answer?.result?.response ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
    const block = raw.match(/\`\`\`(?:timeline|text)?[ \t]*\n([\s\S]*?)\n?\`\`\`/);
    if (!block) throw new HttpError(502, "The model did not return a timeline");
    const edited = block[1].replace(/[ \t]+$/gm, "").trim();
    const { text: accepted, added, rejected } = acceptPlaces(trimmed, edited, candidates);
    TimelineText.parse(accepted);
    return finish(accepted, added, rejected ? `Answer rejected: ${rejected}` : "");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "Places failed: " + (error.message || error) }, 502);
  }
}

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
    const assets = text.match(ASSET_LINE) || [];
    // Embedded images never reach the model: an asset line is thousands of
    // tokens of base64 it would mangle. They go back in afterwards. Link
    // lines from older texts are dropped; the name is the URL now.
    const trimmed = text.replace(ASSET_LINE, "").replace(LINK_LINES, "").replace(/\n{3,}/g, "\n\n").trim();
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
        { place, url } = TimelineText.location(event, day, model);
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

function notFound(env) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No such timeline</title><style>:root{color-scheme:dark}html,body{margin:0;background:#0f1418;color:#dfebf2;font-family:system-ui,-apple-system,sans-serif}.msg{max-width:520px;margin:18vh auto;padding:0 24px;text-align:center;line-height:1.5}.msg a{color:#8fc7dd}</style></head><body><p class="msg">There is no timeline at this link.<br><a href="${escape(env.STUDIO_URL)}">Open Timeline Studio</a></p></body></html>`;
}

async function encode(text) {
  const bytes = new TextEncoder().encode(text);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return "z=" + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
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
