// Short links for Timeline Studio.
//
// A long share link carries the whole timeline in its fragment as
// "z=<deflate-raw, base64url>" (see TimelineText.encodeLink). This Worker
// stores that same payload under a short id in KV:
//
//   POST /            body = the payload      -> { id, url }
//   GET  /<id>        the viewer page with the payload inlined
//   GET  /<id>.txt    the timeline text itself
//   PUT  /<name>      body = the payload      -> { url, key? }   named link
//   GET  /<name>      the viewer for whatever that name points to now
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

const MAX_PAYLOAD = 64 * 1024;
const PAYLOAD = /^(z|t)=[A-Za-z0-9_-]{1,}$/;
const LINK_LINE = /^([ \t]*link[ \t]*:[ \t]*[a-z0-9][a-z0-9-]{1,30}[a-z0-9])[ \t]+([A-Za-z0-9_-]{16,40})[ \t]*$/m;
const ID = /^\/([A-Za-z0-9_-]{7,22})(\.txt)?$/;
const ALIAS = /^\/([a-z0-9][a-z0-9-]{1,30}[a-z0-9])(\.txt)?$/;
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
    const alias = url.pathname.match(ALIAS);
    if (alias && request.method === "PUT") return claim(request, env, alias[1]);
    const match = url.pathname.match(ID) || alias;
    if (!match || (request.method !== "GET" && request.method !== "HEAD"))
      return new Response("Not found", { status: 404 });
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function page(html, status = 200, extra = {}) {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", ...extra } });
}
