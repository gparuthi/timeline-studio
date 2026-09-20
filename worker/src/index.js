// Short links for Timeline Studio.
//
// A long share link carries the whole timeline in its fragment as
// "z=<deflate-raw, base64url>" (see TimelineText.encodeLink). This Worker
// stores that same payload under a short id in KV:
//
//   POST /            body = the payload      -> { id, url }
//   GET  /<id>        the viewer page with the payload inlined
//   GET  /<id>.txt    the timeline text itself
//
// Ids are content-addressed (a prefix of sha256(payload)), so sharing the
// same timeline twice yields the same link and never a second KV write.
// Nothing here is authenticated: anyone can create a link, which is the
// point of a share service. Payloads are capped and validated so KV only
// ever holds something the viewer can decode.

const MAX_PAYLOAD = 64 * 1024;
const PAYLOAD = /^(z|t)=[A-Za-z0-9_-]{1,}$/;
const ID = /^\/([A-Za-z0-9_-]{7,22})(\.txt)?$/;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/") {
      if (request.method === "POST") return create(request, env);
      return Response.redirect(env.STUDIO_URL, 302);
    }
    const match = url.pathname.match(ID);
    if (!match || (request.method !== "GET" && request.method !== "HEAD"))
      return new Response("Not found", { status: 404 });
    const payload = await env.LINKS.get(match[1]);
    if (!payload) return page(notFound(env), 404);
    if (match[2]) {
      const text = await decode(payload);
      return new Response(text, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400", ...CORS },
      });
    }
    return page(await viewer(payload, match[1], env), 200, { "cache-control": "public, max-age=86400" });
  },
};

async function create(request, env) {
  if (Number(request.headers.get("content-length")) > MAX_PAYLOAD) return json({ error: "Timeline too large" }, 413);
  const payload = (await request.text()).trim();
  if (payload.length > MAX_PAYLOAD) return json({ error: "Timeline too large" }, 413);
  if (!PAYLOAD.test(payload)) return json({ error: "Expected a timeline link payload (z=… or t=…)" }, 400);
  let text;
  try {
    text = await decode(payload);
  } catch (error) {
    return json({ error: "Payload does not decode" }, 400);
  }
  if (!text.trim()) return json({ error: "Empty timeline" }, 400);
  const digest = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))));
  // Content-addressed: the same timeline always gets the same id. On the
  // (astronomically unlikely) prefix collision, take a longer prefix.
  let id;
  for (const length of [7, 10, 14, 22]) {
    const candidate = digest.slice(0, length);
    const existing = await env.LINKS.get(candidate);
    if (existing === null) {
      await env.LINKS.put(candidate, payload, { metadata: { created: new Date().toISOString(), title: title(text) } });
      id = candidate;
      break;
    }
    if (existing === payload) {
      id = candidate;
      break;
    }
  }
  if (!id) return json({ error: "Could not allocate an id" }, 500);
  const link = new URL("/" + id, request.url);
  if (link.hostname !== "localhost") link.protocol = "https:";
  return json({ id, url: link.href });
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
    document.body.insertAdjacentHTML(
      "beforeend",
      '<p style="margin:0;padding:18px 0 28px;text-align:center;font:12px system-ui,sans-serif;letter-spacing:1px"><a href="' + studio + "#" + payload + '" style="color:inherit;opacity:.55;text-decoration:none">Edit this timeline</a></p>'
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
