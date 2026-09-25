// Cost guards (docs/limits.md): the Budget Durable Object, the costly paths
// that ask it, fail-open and fail-closed, size caps, the per-room RunRoom
// caps, picture expiry and GET /limits. Run: node --test tests/*.test.*
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../worker/src/index.js";
import TimelineText from "../timeline-renderer.js";
import { Budget, CAPS, budget, dayOf, resetsAt } from "../worker/src/budget.js";
import { RunRoom, MAX_SOCKETS, MAX_OPS_PER_SECOND } from "../worker/src/runroom.js";
import { refreshImages } from "../worker/src/images.js";
import { eventObjects } from "../worker/src/caldav.js";

const read = (file) => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
const DAY = read("example.timeline.txt");
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const b64 = (bytes) => Buffer.from(bytes).toString("base64");

function kv() {
  const store = new Map();
  const bytes = (value) => (typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value));
  return {
    store,
    puts: [],
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
      this.puts.push(key);
      store.set(key, { value: typeof value === "string" ? value : bytes(value).slice(), metadata: options.metadata || null, options });
    },
    async list({ prefix = "" } = {}) {
      return { keys: [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata })), list_complete: true };
    },
  };
}

function storage() {
  const data = new Map();
  return {
    get: async (key) => (data.has(key) ? structuredClone(data.get(key)) : undefined),
    put: async (key, value) => void data.set(key, structuredClone(value)),
    delete: async (key) => data.delete(key),
  };
}

// A Budget namespace with one real instance on a settable clock, and a log
// of every take.
function budgetNamespace(caps = {}, start = Date.UTC(2026, 8, 25, 12)) {
  let now = start;
  const room = new Budget({ storage: storage() }, { BUDGET_CAPS: caps }, () => now);
  const takes = [];
  const fetch = room.fetch.bind(room);
  room.fetch = async (request) => {
    if (request.method === "POST" && new URL(request.url).pathname === "/take") takes.push(await request.clone().json());
    return fetch(request);
  };
  return { ns: { idFromName: () => "global", get: () => room }, room, takes, advance: (ms) => (now += ms) };
}
const broken = { idFromName: () => "global", get: () => ({ fetch: async () => { throw new Error("the Budget is down"); } }) };

const put = (env, name, text, headers = {}) =>
  worker.fetch(new Request(`https://tl.gaup.uk/${name}`, { method: "PUT", body: "t=" + Buffer.from(text).toString("base64url"), headers }), env);
const mcp = async (env, name, args) =>
  (await (await worker.fetch(new Request("https://tl.gaup.uk/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env)).json()).result;
const json = (url, body) => new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const kinds = (takes) => takes.map((t) => `${t.kind}:${t.amount}`);

test("Budget: counts per UTC day, refuses past the cap, rolls over at midnight, keeps img_total", async () => {
  const { room, advance } = budgetNamespace({ ai: 3 });
  const take = async (kind, amount) => (await room.fetch(json("https://budget/take", { kind, amount }))).json();
  assert.equal((await take("ai", 1)).ok, true);
  assert.equal((await take("ai", 2)).used, 3);
  const refused = await take("ai", 1);
  assert.equal(refused.ok, false);
  assert.equal(refused.cap, 3);
  assert.equal(refused.resets_at, "2026-09-26T00:00:00.000Z");
  assert.equal((await take("img_total", 5000)).used, 5000);
  // The counters are exact under concurrent takes.
  await Promise.all(Array.from({ length: 50 }, () => take("doc_save", 1)));
  assert.equal((await (await room.fetch(new Request("https://budget/usage"))).json()).kinds.doc_save.used, 50);
  // Past midnight UTC the daily counters start again; the all-time total does not.
  advance(13 * 60 * 60 * 1000);
  assert.equal((await take("ai", 1)).ok, true);
  const usage = await (await room.fetch(new Request("https://budget/usage"))).json();
  assert.equal(usage.day, "2026-09-26");
  assert.deepEqual(usage.kinds.ai, { used: 1, cap: 3 });
  assert.equal(usage.kinds.doc_save.used, 0);
  assert.deepEqual(usage.img_total, { used: 5000, cap: CAPS.img_total });
  // The weekly recount sets the total.
  assert.equal((await (await room.fetch(json("https://budget/total", { bytes: 1234 }))).json()).img_total.used, 1234);
  assert.equal((await room.fetch(json("https://budget/take", { kind: "nope", amount: 1 }))).status, 400);
  assert.equal(dayOf(Date.UTC(2026, 0, 1, 23, 59)), "2026-01-01");
  assert.equal(resetsAt(Date.UTC(2026, 11, 31, 8)), "2027-01-01T00:00:00.000Z");
});

test("the caps are one object with every kind", () => {
  assert.deepEqual(Object.keys(CAPS).sort(), ["ai", "doc_new", "doc_save", "fetch", "img_bytes", "img_count", "img_total", "mcp"]);
  assert.equal(CAPS.img_total, 1024 * 1024 * 1024);
});

test("each costly path takes the right kind and amount; reads and page views take nothing", async () => {
  const b = budgetNamespace();
  let aiCalls = 0;
  const env = {
    LINKS: kv(),
    BUDGET: b.ns,
    AI: { run: async () => (aiCalls++, { response: "```timeline\ntitle: T\n08:00 | Coffee\n```" }) },
    ASSETS: { fetch: async () => new Response("", { status: 404 }) },
  };
  // A new name: doc_new and doc_save. Saving it again: doc_save only.
  assert.equal((await put(env, "guard-day", DAY)).status, 200);
  assert.deepEqual(kinds(b.takes), ["doc_new:1", "doc_save:1"]);
  b.takes.length = 0;
  assert.equal((await put(env, "guard-day", DAY + "\n")).status, 200);
  assert.deepEqual(kinds(b.takes), ["doc_save:1"]);
  b.takes.length = 0;
  // Reads take nothing.
  await worker.fetch(new Request("https://tl.gaup.uk/guard-day.txt"), env);
  assert.deepEqual(b.takes, []);
  // A new picture: count, bytes, total. The same picture again: nothing.
  const upload = () => worker.fetch(new Request("https://tl.gaup.uk/img", { method: "POST", body: JPEG, headers: { "content-type": "image/jpeg" } }), env);
  assert.equal((await upload()).status, 201);
  assert.deepEqual(kinds(b.takes), ["img_count:1", `img_bytes:${JPEG.length}`, `img_total:${JPEG.length}`]);
  b.takes.length = 0;
  assert.equal((await upload()).status, 201);
  assert.deepEqual(b.takes, [], "a duplicate is free");
  // A URL fetched for POST /img: fetch first.
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(Uint8Array.from([...JPEG, 1]), { headers: { "content-type": "image/jpeg" } });
  try {
    assert.equal((await worker.fetch(json("https://tl.gaup.uk/img", { url: "https://files.example/x.jpg" }), env)).status, 201);
    assert.deepEqual(kinds(b.takes), ["fetch:1", "img_count:1", "img_bytes:11", "img_total:11"]);
    b.takes.length = 0;
    // /resolve follows a map link: fetch.
    globalThis.fetch = async () => Object.assign(new Response(""), { url: "https://www.google.com/maps/place/Blue+Bottle/" });
    await worker.fetch(new Request("https://tl.gaup.uk/resolve?u=" + encodeURIComponent("https://maps.app.goo.gl/abc")), env);
    assert.deepEqual(kinds(b.takes), ["fetch:1"]);
    b.takes.length = 0;
  } finally {
    globalThis.fetch = real;
  }
  // /command: one ai per model call.
  assert.equal((await worker.fetch(json("https://tl.gaup.uk/command", { text: DAY, command: "add coffee" }), env)).status, 200);
  assert.deepEqual(kinds(b.takes), ["ai:1"]);
  b.takes.length = 0;
  // /places: ai when there is something to ask about.
  env.AI.run = async () => (aiCalls++, { response: "[]" });
  assert.equal((await worker.fetch(json("https://tl.gaup.uk/places", { text: DAY }), env)).status, 200);
  assert.deepEqual(kinds(b.takes), ["ai:1"]);
  b.takes.length = 0;
  // MCP: every tools/call is one mcp; create adds doc_new and doc_save.
  const made = await mcp(env, "create_timeline", { text: DAY, name: "guard-mcp" });
  assert.equal(made.isError, undefined, JSON.stringify(made));
  assert.deepEqual(kinds(b.takes), ["mcp:1", "doc_new:1", "doc_save:1"]);
  b.takes.length = 0;
  await mcp(env, "get_timeline", { name: "guard-mcp" });
  assert.deepEqual(kinds(b.takes), ["mcp:1"]);
  b.takes.length = 0;
  const pic = Uint8Array.from([...JPEG, 2, 3]);
  const up = await mcp(env, "upload_image", { data_base64: b64(pic), timeline: "guard-mcp", step: "Farmers market" });
  assert.equal(up.isError, undefined, JSON.stringify(up));
  assert.deepEqual(kinds(b.takes), ["mcp:1", "img_count:1", "img_bytes:12", "img_total:12", "doc_save:1"]);
  b.takes.length = 0;
  // CalDAV writes are doc saves.
  const text = (await (await worker.fetch(new Request("https://tl.gaup.uk/guard-day.txt"), env)).text()),
    event = eventObjects(TimelineText.parse(text), "guard-day", "/dav/guard-day/cal/")[0];
  const deleted = await worker.fetch(new Request("https://tl.gaup.uk" + event.href, { method: "DELETE", headers: { authorization: "Basic " + btoa("guard-day:x") } }), env);
  assert.equal(deleted.status, 204);
  assert.deepEqual(kinds(b.takes), ["doc_save:1"]);
  assert.ok(aiCalls >= 2);
});

test("a refusal is 429 (or isError) with the kind and reset time, and nothing is written, fetched or asked", async () => {
  const b = budgetNamespace({ ai: 0, img_count: 0, doc_save: 0, fetch: 0, mcp: 0 });
  let aiCalls = 0,
    fetches = 0;
  const env = { LINKS: kv(), BUDGET: b.ns, AI: { run: async () => (aiCalls++, { response: "" }) } };
  const saved = await put(env, "guard-full", DAY);
  assert.equal(saved.status, 429);
  const body = await saved.json();
  assert.equal(body.error, "daily-limit");
  assert.equal(body.kind, "doc_save");
  assert.match(body.resets_at, /T00:00:00\.000Z$/);
  assert.match(body.message, /daily limit for saving timelines/);
  assert.equal(env.LINKS.store.size, 0);
  const command = await worker.fetch(json("https://tl.gaup.uk/command", { text: DAY, command: "add coffee" }), env);
  assert.equal(command.status, 429);
  assert.equal((await command.json()).kind, "ai");
  assert.equal(aiCalls, 0);
  const image = await worker.fetch(new Request("https://tl.gaup.uk/img", { method: "POST", body: JPEG }), env);
  assert.equal(image.status, 429);
  assert.equal([...env.LINKS.store.keys()].length, 0);
  const real = globalThis.fetch;
  globalThis.fetch = async () => (fetches++, new Response(""));
  try {
    assert.equal((await worker.fetch(new Request("https://tl.gaup.uk/resolve?u=" + encodeURIComponent("https://maps.app.goo.gl/abc")), env)).status, 429);
    assert.equal((await worker.fetch(json("https://tl.gaup.uk/img", { url: "https://files.example/x.jpg" }), env)).status, 429);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(fetches, 0);
  const call = await mcp(env, "format_guide", {});
  assert.equal(call.isError, true);
  assert.equal(call.structuredContent.error, "daily-limit");
  assert.match(call.content[0].text, /daily limit for connector calls/);
});

test("when the Budget fails: saves go through (fail open), AI and pictures are refused (fail closed)", async () => {
  let aiCalls = 0;
  const env = { LINKS: kv(), BUDGET: broken, AI: { run: async () => (aiCalls++, { response: "```timeline\ntitle: T\n08:00 | A\n```" }) } };
  assert.equal((await put(env, "guard-open", DAY)).status, 200);
  assert.ok(env.LINKS.store.has("doc:guard-open"));
  const made = await mcp(env, "create_timeline", { text: DAY, name: "guard-open-mcp" });
  assert.equal(made.isError, undefined, "mcp and doc kinds fail open");
  const command = await worker.fetch(json("https://tl.gaup.uk/command", { text: DAY, command: "add coffee" }), env);
  assert.equal(command.status, 503);
  assert.equal((await command.json()).error, "budget-unavailable");
  assert.equal(aiCalls, 0);
  const image = await worker.fetch(new Request("https://tl.gaup.uk/img", { method: "POST", body: JPEG }), env);
  assert.equal(image.status, 503);
  assert.equal([...env.LINKS.store.keys()].filter((k) => k.startsWith("img:")).length, 0);
  // Without a Budget binding at all (tests, a local copy) nothing is counted.
  await budget({}).take("ai", 1);
});

test("size caps: command, places and CalDAV bodies, and a body with no declared length", async () => {
  const env = { LINKS: kv(), AI: { run: async () => assert.fail("no model call") } };
  const big = "x".repeat(101 * 1024);
  const stream = () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ text: big, command: "go" })));
        controller.close();
      },
    });
  for (const path of ["command", "places"]) {
    const response = await worker.fetch(new Request(`https://tl.gaup.uk/${path}`, { method: "POST", body: stream(), duplex: "half", headers: { "content-type": "application/json" } }), env);
    assert.equal(response.status, 413, path);
  }
  await put(env, "guard-dav", DAY);
  const event = eventObjects(TimelineText.parse(DAY), "guard-dav", "/dav/guard-dav/cal/")[0];
  const dav = await worker.fetch(new Request("https://tl.gaup.uk" + event.href, { method: "PUT", body: big, headers: { authorization: "Basic " + btoa("guard-dav:x") } }), env);
  assert.equal(dav.status, 413);
});

test("SAVES: timeline writes per address are limited", async () => {
  const env = { LINKS: kv(), SAVES: { limit: async ({ key }) => (assert.equal(key, "198.51.100.4"), { success: false }) } };
  const response = await put(env, "guard-saves", DAY, { "cf-connecting-ip": "198.51.100.4" });
  assert.equal(response.status, 429);
  assert.equal(env.LINKS.store.size, 0);
});

test("RunRoom: 20 sockets a room (the next is closed), 10 ops a second", async () => {
  const sockets = [];
  let now = 5_000_000;
  globalThis.WebSocketPair ??= class {
    constructor() {
      const make = () => ({ sent: [], closed: null, send(m) { this.sent.push(m); }, close(code, reason) { this.closed = { code, reason }; } });
      return { 0: make(), 1: make() };
    }
  };
  const OriginalResponse = globalThis.Response;
  const ctx = {
    storage: storage(),
    getWebSockets: () => sockets.filter((s) => !s.closed),
    acceptWebSocket: (ws) => sockets.push(ws),
  };
  const room = new RunRoom(ctx, {}, () => now);
  // Response with status 101 is not constructible in node: stand in.
  globalThis.Response = class extends OriginalResponse {
    constructor(body, init = {}) {
      super(body, init.status === 101 ? { ...init, status: 200 } : init);
    }
  };
  try {
    for (let i = 0; i < MAX_SOCKETS + 1; i++) await room.fetch(new Request("https://run/", { headers: { upgrade: "websocket" } }));
  } finally {
    globalThis.Response = OriginalResponse;
  }
  assert.equal(sockets.length, MAX_SOCKETS + 1);
  assert.equal(sockets.filter((s) => s.closed).length, 1);
  assert.equal(sockets.at(-1).closed.code, 1013);
  assert.match(sockets.at(-1).closed.reason, /Room full/);
  assert.equal(sockets.at(-1).sent.length, 0);
  const op = (body) => room.fetch(new Request("https://run/op", { method: "POST", body: JSON.stringify(body) }));
  for (let i = 0; i < MAX_OPS_PER_SECOND; i++) assert.equal((await op({ op: i % 2 ? "pause" : "start" })).status, 200);
  assert.equal((await op({ op: "stop" })).status, 429, "the 11th op in a second");
  now += 1001;
  assert.equal((await op({ op: "stop" })).status, 200);
});

test("pictures expire unless a saved timeline refreshes them, at most once a month", async () => {
  const env = { LINKS: kv() };
  const t0 = Date.UTC(2026, 0, 1);
  await env.LINKS.put("img:00000000000000aa", JPEG, { expirationTtl: 1, metadata: { type: "image/jpeg", size: JPEG.length, refreshed: t0 } });
  await env.LINKS.put("img:00000000000000bb", JPEG, { expirationTtl: 1, metadata: { type: "image/jpeg", size: JPEG.length, refreshed: t0 } });
  const text = "title: T\nasset a: https://tl.gaup.uk/img/00000000000000aa.jpg\ncover: https://tl.gaup.uk/img/00000000000000bb.jpg\nasset c: https://elsewhere.example/img/00000000000000cc.jpg\n08:00 | A | | | sky | @a\n";
  const hosts = new Set(["tl.gaup.uk"]);
  // Ten days on: too soon to push them out again.
  assert.equal(await refreshImages(env, text, hosts, t0 + 10 * 864e5), 0);
  // Forty days on (and a day past the last check): both are refreshed for another 180 days.
  assert.equal(await refreshImages(env, text, hosts, t0 + 40 * 864e5), 2);
  const entry = env.LINKS.store.get("img:00000000000000aa");
  assert.equal(entry.options.expirationTtl, 180 * 86400);
  assert.equal(entry.metadata.refreshed, t0 + 40 * 864e5);
  assert.equal(entry.metadata.size, JPEG.length);
  // The same day again: remembered, not even read.
  assert.equal(await refreshImages(env, text, hosts, t0 + 40 * 864e5 + 1000), 0);
});

test("GET /limits shows today's usage and caps; the weekly recount sets img_total", async () => {
  const b = budgetNamespace({ ai: 7 });
  const env = { LINKS: kv(), BUDGET: b.ns };
  await put(env, "guard-limits", DAY);
  await worker.fetch(new Request("https://tl.gaup.uk/img", { method: "POST", body: JPEG }), env);
  const response = await worker.fetch(new Request("https://tl.gaup.uk/limits"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  const usage = await response.json();
  assert.equal(usage.day, "2026-09-25");
  assert.deepEqual(usage.kinds.ai, { used: 0, cap: 7 });
  assert.deepEqual(usage.kinds.doc_save, { used: 1, cap: CAPS.doc_save });
  assert.equal(usage.img_total.used, JPEG.length);
  assert.equal((await worker.fetch(new Request("https://tl.gaup.uk/limits", { method: "PUT", body: "t=x" }), env)).status, 409, "limits is a reserved name");
  // The recount: the pictures still listed.
  env.LINKS.store.delete([...env.LINKS.store.keys()].find((k) => k.startsWith("img:")));
  await env.LINKS.put("img:1111111111111111", new Uint8Array(40), { metadata: { type: "image/png", size: 40 } });
  const waits = [];
  await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal((await (await worker.fetch(new Request("https://tl.gaup.uk/limits"), env)).json()).img_total.used, 40);
});
