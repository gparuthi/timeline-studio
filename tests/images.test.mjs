// POST /img and GET /img/<hash>.<ext> against an in-memory KV.
// Run: node --test tests/*.test.*
import test from "node:test";
import assert from "node:assert/strict";
import worker, { sniffImage } from "../worker/src/index.js";

function kv() {
  const store = new Map();
  const bytes = (value) => (typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value));
  return {
    store,
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
      store.set(key, { value: typeof value === "string" ? value : bytes(value).slice(), metadata: options.metadata || null });
    },
  };
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const post = (env, body, headers = {}) =>
  worker.fetch(new Request("https://tl.gaup.uk/img", { method: "POST", body, headers: { "content-type": "image/png", ...headers } }), env);

test("images are recognised by their bytes, not their label", () => {
  assert.equal(sniffImage(PNG), "image/png");
  assert.equal(sniffImage(WEBP), "image/webp");
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a")), "image/gif");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), "");
});

test("an upload is stored once by content and served for a year", async () => {
  const env = { LINKS: kv() };
  const response = await post(env, WEBP, { "content-type": "image/png" });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.url, /^https:\/\/tl\.gaup\.uk\/img\/[0-9a-f]{16}\.webp$/);
  assert.equal(body.type, "image/webp", "the bytes decide the type");
  const hash = body.url.match(/([0-9a-f]{16})/)[1];
  assert.deepEqual(env.LINKS.store.get("img:" + hash).metadata, { type: "image/webp", size: WEBP.length });
  // Again: the same URL, no second write.
  let writes = 0;
  const put = env.LINKS.put.bind(env.LINKS);
  env.LINKS.put = (...args) => (writes++, put(...args));
  assert.equal((await (await post(env, WEBP)).json()).url, body.url);
  assert.equal(writes, 0);
  const image = await worker.fetch(new Request(body.url), env);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.equal(image.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(image.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), WEBP);
  assert.equal((await worker.fetch(new Request("https://tl.gaup.uk/img/0000000000000000.png"), env)).status, 404);
});

test("uploads are refused when too large, not an image, or too frequent", async () => {
  const env = { LINKS: kv() };
  const big = new Uint8Array(1.5 * 1024 * 1024 + 1);
  big.set(PNG);
  assert.equal((await post(env, big)).status, 413);
  const svg = await post(env, new TextEncoder().encode("<svg/>"), { "content-type": "image/svg+xml" });
  assert.equal(svg.status, 415);
  assert.match((await svg.json()).error, /PNG, JPEG, WebP or GIF/);
  assert.equal((await post(env, new Uint8Array(0))).status, 400);
  const limited = { LINKS: kv(), IMAGES: { limit: async () => ({ success: false }) } };
  assert.equal((await post(limited, PNG)).status, 429);
  assert.equal(limited.LINKS.store.size, 0);
});

test("img and run are reserved link names", async () => {
  for (const name of ["img", "run"]) {
    const response = await worker.fetch(new Request(`https://tl.gaup.uk/${name}`, { method: "PUT", body: "t=dGl0bGU6IFQKMDg6MDAgfCBB" }), { LINKS: kv() });
    assert.equal(response.status, 409, name);
  }
});
