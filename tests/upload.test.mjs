// Pictures from agents: the MCP tool upload_image and POST /img with JSON
// (docs/mcp.md, "Image upload for agents"), against an in-memory KV.
// Run: node --test tests/*.test.*
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../worker/src/index.js";
import { TOOLS } from "../worker/src/mcp.js";

const read = (file) => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");

function kv() {
  const store = new Map();
  const bytes = (value) => (typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value));
  return {
    store,
    writes: 0,
    async get(key, type) {
      const entry = store.get(key);
      if (!entry) return null;
      if (type === "stream") return new Blob([bytes(entry.value)]).stream();
      if (type === "arrayBuffer") return bytes(entry.value).slice().buffer;
      const text = typeof entry.value === "string" ? entry.value : new TextDecoder().decode(entry.value);
      return type === "json" ? JSON.parse(text) : text;
    },
    async getWithMetadata(key, type) {
      const entry = store.get(key);
      return { value: entry ? await this.get(key, type) : null, metadata: entry ? entry.metadata : null };
    },
    async put(key, value, options = {}) {
      this.writes++;
      store.set(key, { value: typeof value === "string" ? value : bytes(value).slice(), metadata: options.metadata || null });
    },
  };
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const WORKOUT = read("example.routine.txt");
const RECIPE = read("example.recipe.txt");

function setup(extra = {}) {
  const env = { LINKS: kv(), ...extra };
  let id = 1;
  const call = async (name, args) => {
    const response = await worker.fetch(
      new Request("https://tl.gaup.uk/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
        body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: "tools/call", params: { name, arguments: args } }),
      }),
      env,
    );
    const answer = await response.json();
    assert.ok(answer.result, JSON.stringify(answer));
    return answer.result;
  };
  const text = async (name) => (await call("get_timeline", { name })).structuredContent;
  return { env, call, text };
}

// A stubbed global fetch for the url form: path -> Response (or a function).
async function withFetch(routes, fn) {
  const real = globalThis.fetch,
    seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(url);
    const route = routes[url];
    if (!route) return new Response("nope", { status: 404 });
    return typeof route === "function" ? route(url, init) : route.clone();
  };
  try {
    return await fn(seen);
  } finally {
    globalThis.fetch = real;
  }
}
const image = (bytes, type = "image/jpeg", headers = {}) => new Response(bytes, { headers: { "content-type": type, ...headers } });

test("upload_image stores base64, raw or as a data: URI, and the bytes decide the type", async () => {
  const { call, env } = setup();
  const raw = await call("upload_image", { data_base64: b64(JPEG) });
  assert.equal(raw.isError, undefined, raw.content[0].text);
  assert.match(raw.structuredContent.url, /^https:\/\/tl\.gaup\.uk\/img\/[0-9a-f]{16}\.jpg$/);
  assert.equal(raw.structuredContent.type, "image/jpeg");
  // A data: URI; its label says PNG but the bytes are WebP, and the bytes win.
  const uri = await call("upload_image", { data_base64: "data:image/png;base64," + b64(WEBP) });
  assert.match(uri.structuredContent.url, /\.webp$/);
  // Line breaks and URL-safe base64 are fine too.
  const wrapped = await call("upload_image", { data_base64: b64(PNG).replace(/(.{8})/g, "$1\n").replace(/\+/g, "-").replace(/\//g, "_") });
  assert.match(wrapped.structuredContent.url, /\.png$/);
  // The same bytes again: the same URL, nothing written.
  const writes = env.LINKS.writes;
  assert.equal((await call("upload_image", { data_base64: "data:image/jpeg;base64," + b64(JPEG) })).structuredContent.url, raw.structuredContent.url);
  assert.equal(env.LINKS.writes, writes);
});

test("upload_image refuses what is not a picture, too large, or badly formed, and stores nothing", async () => {
  const { call, env } = setup();
  const svg = await call("upload_image", { data_base64: "data:image/png;base64," + b64(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")) });
  assert.equal(svg.isError, true);
  assert.match(svg.content[0].text, /PNG, JPEG, WebP or GIF/);
  const text = await call("upload_image", { data_base64: b64(new TextEncoder().encode("hello, not an image")) });
  assert.equal(text.isError, true);
  const big = new Uint8Array(1.5 * 1024 * 1024 + 1);
  big.set(JPEG);
  const huge = await call("upload_image", { data_base64: b64(big) });
  assert.equal(huge.isError, true);
  assert.match(huge.content[0].text, /1\.5 MB/);
  assert.match(huge.content[0].text, /1280 px/);
  assert.equal((await call("upload_image", { data_base64: "not base64 at all!" })).isError, true);
  assert.equal((await call("upload_image", {})).isError, true, "no source");
  assert.equal((await call("upload_image", { data_base64: b64(JPEG), url: "https://example.com/a.jpg" })).isError, true, "two sources");
  assert.equal((await call("upload_image", { data_base64: b64(JPEG), mime_type: "image/svg+xml" })).isError, true);
  assert.equal([...env.LINKS.store.keys()].filter((k) => k.startsWith("img:")).length, 0);
});

test("upload_image fetches an https url: redirects, an image content-type, and the size cap", async () => {
  const { call } = setup();
  await withFetch(
    {
      "https://files.example/a": new Response(null, { status: 302, headers: { location: "/b" } }),
      "https://files.example/b": image(JPEG),
      "https://files.example/page": image(new TextEncoder().encode("<html>"), "text/html"),
      "https://files.example/svg": image(new TextEncoder().encode("<svg/>"), "image/svg+xml"),
      "https://files.example/big": image(new Uint8Array(1.5 * 1024 * 1024 + 10), "image/jpeg"),
      "https://files.example/lie": image(new TextEncoder().encode("GIF-not-really"), "image/png"),
      "https://files.example/insecure": new Response(null, { status: 301, headers: { location: "http://files.example/b" } }),
      "https://files.example/r1": new Response(null, { status: 302, headers: { location: "/r2" } }),
      "https://files.example/r2": new Response(null, { status: 302, headers: { location: "/r3" } }),
      "https://files.example/r3": new Response(null, { status: 302, headers: { location: "/r4" } }),
      "https://files.example/r4": new Response(null, { status: 302, headers: { location: "/b" } }),
    },
    async (seen) => {
      const ok = await call("upload_image", { url: "https://files.example/a" });
      assert.equal(ok.isError, undefined, ok.content[0].text);
      assert.match(ok.structuredContent.url, /\.jpg$/);
      assert.deepEqual(seen.slice(0, 2), ["https://files.example/a", "https://files.example/b"]);
      assert.match((await call("upload_image", { url: "https://files.example/page" })).content[0].text, /not an image \(text\/html\)/);
      assert.equal((await call("upload_image", { url: "https://files.example/svg" })).isError, true);
      assert.match((await call("upload_image", { url: "https://files.example/big" })).content[0].text, /1\.5 MB/);
      assert.match((await call("upload_image", { url: "https://files.example/lie" })).content[0].text, /PNG, JPEG, WebP or GIF/);
      assert.match((await call("upload_image", { url: "https://files.example/insecure" })).content[0].text, /away from https/);
      assert.match((await call("upload_image", { url: "https://files.example/r1" })).content[0].text, /3 at most/);
      assert.match((await call("upload_image", { url: "http://files.example/b" })).content[0].text, /https/);
      // A picture already stored here is not fetched again.
      const before = seen.length;
      assert.equal((await call("upload_image", { url: ok.structuredContent.url })).structuredContent.url, ok.structuredContent.url);
      assert.equal(seen.length, before);
    },
  );
});

test("upload_image puts the picture on a step by title, prefix or line number, or as the cover", async () => {
  const { call, env, text } = setup();
  const made = (await call("create_timeline", { text: WORKOUT, name: "core-pics" })).structuredContent;
  // An exact title (any case).
  const plank = await call("upload_image", { data_base64: b64(JPEG), timeline: "core-pics", step: "plank", version: made.version });
  assert.equal(plank.isError, undefined, plank.content[0].text);
  assert.equal(plank.structuredContent.asset, "plank");
  assert.equal(plank.structuredContent.timeline_url, "https://tl.gaup.uk/core-pics");
  assert.match(plank.content[0].text, /\[Open the timeline\]\(https:\/\/tl\.gaup\.uk\/core-pics\)/);
  let now = await text("core-pics");
  assert.equal(now.version, plank.structuredContent.version);
  assert.match(now.text, new RegExp(`^asset plank: ${plank.structuredContent.url.replace(/\./g, "\\.")}$`, "m"));
  assert.match(now.text, /^\+45s\s*\| Plank \|.*\| @plank$/m);
  // A unique start of a title.
  const glute = await call("upload_image", { data_base64: b64(PNG), timeline: "https://tl.gaup.uk/core-pics", step: "glute" });
  assert.equal(glute.structuredContent.asset, "glute-bridge");
  // A line number: the 6th field of that line.
  const lines = (await text("core-pics")).text.split("\n"),
    stretch = lines.findIndex((l) => /\| Stretch\b/.test(l)) + 1;
  const byLine = await call("upload_image", { data_base64: b64(WEBP), timeline: "core-pics", step: String(stretch) });
  assert.equal(byLine.structuredContent.asset, "stretch");
  now = await text("core-pics");
  assert.match(now.text.split("\n")[stretch - 1], /\| @stretch$/);
  // Replacing a step's picture reuses its asset.
  const again = await call("upload_image", { data_base64: b64(WEBP), timeline: "core-pics", step: "Plank" });
  assert.equal(again.structuredContent.asset, "plank");
  now = await text("core-pics");
  assert.equal(now.text.match(/^asset plank:/gm).length, 1);
  assert.match(now.text, /^asset plank: .*\.webp$/m);
  // The cover.
  const cover = await call("upload_image", { data_base64: b64(JPEG), timeline: "core-pics", cover: true });
  assert.equal(cover.structuredContent.asset, "cover");
  now = await text("core-pics");
  assert.match(now.text, /^cover: @cover$/m);
  assert.match(now.text, /^asset cover: https:\/\/tl\.gaup\.uk\/img\/[0-9a-f]{16}\.jpg$/m);
  assert.ok(env.LINKS.store.has("doc:core-pics"));
});

test("upload_image refuses an ambiguous or missing step and a stale version, before storing", async () => {
  const { call, env, text } = setup();
  const made = (await call("create_timeline", { text: WORKOUT, name: "core-ambiguous" })).structuredContent;
  const images = () => [...env.LINKS.store.keys()].filter((k) => k.startsWith("img:")).length;
  const rest = await call("upload_image", { data_base64: b64(JPEG), timeline: "core-ambiguous", step: "Rest" });
  assert.equal(rest.isError, true);
  assert.match(rest.content[0].text, /More than one step is called “Rest”/);
  assert.match(rest.content[0].text, /Side plank L \(line \d+\)/, "it lists the steps");
  const side = await call("upload_image", { data_base64: b64(JPEG), timeline: "core-ambiguous", step: "side" });
  assert.match(side.content[0].text, /matches more than one step \(Side plank L, Side plank R\)/);
  assert.match((await call("upload_image", { data_base64: b64(JPEG), timeline: "core-ambiguous", step: "Burpees" })).content[0].text, /No step is called “Burpees”. Steps: /);
  assert.match((await call("upload_image", { data_base64: b64(JPEG), timeline: "core-ambiguous", step: "1" })).content[0].text, /Line 1 is not a step/);
  assert.equal((await call("upload_image", { data_base64: b64(JPEG), step: "Plank" })).isError, true, "a step needs a timeline");
  assert.equal((await call("upload_image", { data_base64: b64(JPEG), timeline: "core-ambiguous" })).isError, true, "a timeline needs a step or the cover");
  assert.equal((await call("upload_image", { data_base64: b64(JPEG), timeline: "no-such-timeline", step: "Plank" })).isError, true);
  assert.equal(images(), 0);
  // Someone edited it: an old version is refused with the current text.
  await call("update_timeline", { name: "core-ambiguous", text: WORKOUT.replace("+45s  | Plank", "+50s  | Plank"), version: made.version });
  const stale = await call("upload_image", { data_base64: b64(JPEG), timeline: "core-ambiguous", step: "Plank", version: made.version });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.error, "conflict");
  assert.match(stale.structuredContent.text, /\+50s/);
  assert.doesNotMatch((await text("core-ambiguous")).text, /@plank/);
  assert.equal(images(), 0);
});

test("upload_image counts against the IMAGES limit", async () => {
  const { call, env } = setup({ IMAGES: { limit: async ({ key }) => (assert.equal(key, "203.0.113.7"), { success: false }) } });
  const limited = await call("upload_image", { data_base64: b64(JPEG) });
  assert.equal(limited.isError, true);
  assert.match(limited.content[0].text, /30 a minute/);
  assert.equal(env.LINKS.store.size, 0);
});

test("POST /img takes JSON { data } or { url } beside raw bytes", async () => {
  const env = { LINKS: kv() };
  const post = (body) =>
    worker.fetch(new Request("https://tl.gaup.uk/img", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env);
  const data = await post({ data: "data:image/jpeg;base64," + b64(JPEG) });
  assert.equal(data.status, 201);
  const stored = await data.json();
  assert.match(stored.url, /^https:\/\/tl\.gaup\.uk\/img\/[0-9a-f]{16}\.jpg$/);
  assert.equal((await (await post({ data: b64(JPEG) })).json()).url, stored.url, "same bytes, same URL");
  await withFetch({ "https://files.example/p.webp": image(WEBP, "image/webp") }, async () => {
    const fetched = await post({ url: "https://files.example/p.webp" });
    assert.equal(fetched.status, 201);
    assert.match((await fetched.json()).url, /\.webp$/);
  });
  assert.equal((await post({ data: b64(new TextEncoder().encode("<svg/>")) })).status, 415);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ data: "x", url: "https://a.example/b.png" })).status, 400);
  const notJson = await worker.fetch(new Request("https://tl.gaup.uk/img", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), env);
  assert.equal(notJson.status, 400);
});

test("the tool asks for small JPEG or WebP pictures", () => {
  const tool = TOOLS.find((t) => t.name === "upload_image");
  assert.match(tool.description, /1280 px/);
  assert.match(tool.description, /JPEG or WebP/);
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["data_base64", "url", "mime_type", "timeline", "step", "cover", "asset_name", "version"]);
  assert.equal(tool.annotations.readOnlyHint, false);
});

test("an MCP request past 2.5 MB is refused before it is read as JSON", async () => {
  const { env } = setup();
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "upload_image", arguments: { data_base64: "A".repeat(2.6 * 1024 * 1024) } } });
  const response = await worker.fetch(new Request("https://tl.gaup.uk/mcp", { method: "POST", headers: { "content-type": "application/json" }, body }), env);
  assert.equal(response.status, 413);
  assert.equal(env.LINKS.store.size, 0);
});
