// The MCP connector (worker/src/mcp.js): JSON-RPC over POST /mcp against an
// in-memory KV, the real llms.txt and RunRooms. Run: node --test tests/*.test.*
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../worker/src/index.js";
import { RunRoom } from "../worker/src/runroom.js";
import { formatGuide, sections, TOOLS } from "../worker/src/mcp.js";

const read = (file) => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
const LLMS = read("llms.txt");

function kv() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const entry = store.get(key);
      if (!entry) return null;
      return type === "json" ? JSON.parse(entry.value) : entry.value;
    },
    async getWithMetadata(key, type) {
      const entry = store.get(key);
      return { value: entry ? await this.get(key, type) : null, metadata: entry ? entry.metadata : null };
    },
    async put(key, value, options = {}) {
      store.set(key, { value, metadata: options.metadata || null });
    },
  };
}

// A fake Durable Object namespace whose stubs are RunRooms on a fake clock.
function runs(clock) {
  const rooms = new Map();
  const room = () => {
    const data = new Map();
    const ctx = {
      storage: {
        get: async (key) => (data.has(key) ? structuredClone(data.get(key)) : undefined),
        put: async (key, value) => void data.set(key, structuredClone(value)),
        delete: async (key) => data.delete(key),
      },
      getWebSockets: () => [],
      acceptWebSocket() {},
    };
    return new RunRoom(ctx, {}, clock);
  };
  return {
    idFromName: (name) => "id:" + name,
    get(id) {
      if (!rooms.has(id)) rooms.set(id, room());
      return rooms.get(id);
    },
  };
}

function setup(extra = {}) {
  let now = 1_000_000;
  const env = {
    LINKS: kv(),
    ASSETS: { fetch: async (request) => (new URL(request.url).pathname === "/llms.txt" ? new Response(LLMS) : new Response("nope", { status: 404 })) },
    RUNS: runs(() => now),
    STUDIO_URL: "https://tl.gaup.uk/",
    ...extra,
  };
  const post = (body, headers = {}) =>
    worker.fetch(
      new Request("https://tl.gaup.uk/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      env,
    );
  let nextId = 1;
  const rpc = async (method, params) => (await post({ jsonrpc: "2.0", id: nextId++, method, ...(params ? { params } : {}) })).json();
  const call = async (name, args) => {
    const answer = await rpc("tools/call", { name, arguments: args });
    assert.ok(answer.result, JSON.stringify(answer));
    return answer.result;
  };
  return { env, post, rpc, call, advance: (ms) => (now += ms) };
}

const RECIPE = read("example.recipe.txt");
const WORKOUT = read("example.routine.txt");
const DAY = read("example.timeline.txt");

test("initialize negotiates the version and carries the instructions", async () => {
  const { rpc, post } = setup();
  const known = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  assert.equal(known.result.protocolVersion, "2025-06-18", "a version we speak is echoed");
  assert.deepEqual(known.result.capabilities, { tools: { listChanged: false } });
  assert.equal(known.result.serverInfo.name, "timeline-studio");
  assert.match(known.result.instructions, /Pick the kind first/);
  assert.match(known.result.instructions, /format_guide/);
  assert.match(known.result.instructions, /\+45s \| Plank/);
  const future = await rpc("initialize", { protocolVersion: "2099-01-01" });
  assert.equal(future.result.protocolVersion, "2025-11-25", "otherwise our latest");
  const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(note.status, 202);
  assert.equal(await note.text(), "");
  assert.deepEqual((await rpc("ping")).result, {});
  const unknown = await rpc("resources/list");
  assert.equal(unknown.error.code, -32601);
});

test("tools/list: five tools with schemas, descriptions and annotations", async () => {
  const { rpc } = setup();
  const { tools } = (await rpc("tools/list")).result;
  assert.deepEqual(
    tools.map((t) => t.name),
    ["format_guide", "create_timeline", "get_timeline", "update_timeline", "control_run"],
  );
  for (const tool of tools) {
    assert.ok(tool.description.length > 80, tool.name);
    assert.equal(tool.inputSchema.type, "object");
    for (const [key, schema] of Object.entries(tool.inputSchema.properties)) assert.ok(schema.description, `${tool.name}.${key}`);
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
  }
  const by = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.equal(by.format_guide.annotations.readOnlyHint, true);
  assert.equal(by.get_timeline.annotations.readOnlyHint, true);
  assert.equal(by.create_timeline.annotations.readOnlyHint, false);
  assert.equal(by.update_timeline.annotations.destructiveHint, false);
  assert.deepEqual(by.create_timeline.inputSchema.required, ["text"]);
  assert.deepEqual(by.control_run.inputSchema.properties.op.enum, ["start", "pause", "resume", "stop", "status"]);
});

test("format_guide comes from llms.txt, per kind, without the #text= link recipe", async () => {
  const { call } = setup();
  for (const kind of ["day", "trip", "workout", "recipe", undefined]) {
    const result = await call("format_guide", kind ? { kind } : {});
    const guide = result.structuredContent.guide;
    assert.equal(result.content[0].text, guide);
    assert.doesNotMatch(guide, /#text=|encodeURIComponent|What to send back|connector/, String(kind));
    assert.match(guide, /## Pick the kind first/);
    assert.match(guide, /## The format/);
    assert.match(guide, /### Events/);
    assert.match(guide, /## Rules for a good result/);
    assert.match(guide, /### Pictures/, "pictures apply to every kind");
    assert.match(guide, /create_timeline/);
  }
  const day = (await call("format_guide", { kind: "day" })).structuredContent.guide;
  assert.doesNotMatch(day, /## Routines|### Several days/);
  assert.match(day, /### Places and links/);
  assert.match((await call("format_guide", { kind: "trip" })).structuredContent.guide, /### Several days/);
  const recipe = (await call("format_guide", { kind: "recipe" })).structuredContent.guide;
  assert.match(recipe, /## Routines: workouts and recipes/);
  assert.match(recipe, /15:00 \+25m {3}\| Roast/);
  assert.doesNotMatch(recipe, /### Several days|### Places and links/);
  // Every section of llms.txt but the link recipe is in the whole guide.
  const all = formatGuide(LLMS);
  for (const s of sections(LLMS)) if (s.level > 1 && s.title !== "What to send back") assert.ok(all.includes(s.body), s.title);
  const bad = await call("format_guide", { kind: "novel" });
  assert.equal(bad.isError, true);
});

test("create, get, update: a saved short link, versions, and a stale version refused", async () => {
  const { call, env } = setup();
  const created = await call("create_timeline", { text: RECIPE });
  assert.equal(created.isError, undefined);
  const made = created.structuredContent;
  assert.match(made.name, /^sheet-pan-dinner-[a-z0-9]{5}$/, "title slug plus a random tail, as the studio does");
  assert.equal(made.url, "https://tl.gaup.uk/" + made.name);
  assert.equal(made.kind, "routine");
  assert.equal(made.title, "Sheet-pan dinner");
  assert.equal(made.summary, "45 min · 6 steps · 2 at once");
  assert.match(created.content[0].text, new RegExp(`\\[Open the timeline\\]\\(https://tl\\.gaup\\.uk/${made.name}\\)`));
  assert.ok(env.LINKS.store.has("doc:" + made.name));

  // A link works as well as a name.
  const got = (await call("get_timeline", { name: `https://tl.gaup.uk/${made.name}` })).structuredContent;
  assert.equal(got.text.trim(), RECIPE.trim());
  assert.equal(got.version, made.version);
  assert.ok(got.updated, "when it was saved");
  assert.equal((await call("get_timeline", { name: `tl.gaup.uk/${made.name}` })).structuredContent.name, made.name);

  const edited = RECIPE.replace("15:00 +25m   | Roast", "15:00 +30m   | Roast");
  const updated = await call("update_timeline", { name: made.name, text: edited, version: made.version });
  assert.equal(updated.isError, undefined, updated.content[0].text);
  assert.notEqual(updated.structuredContent.version, made.version);
  assert.equal(updated.structuredContent.summary, "50 min · 6 steps · 2 at once");
  assert.match(updated.content[0].text, /\[Open the timeline\]\(https:\/\/tl\.gaup\.uk\//);

  // Someone edited it since: the old version is refused, with the current text.
  const stale = await call("update_timeline", { name: made.name, text: RECIPE, version: made.version });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.error, "conflict");
  assert.equal(stale.structuredContent.version, updated.structuredContent.version);
  assert.match(stale.structuredContent.text, /15:00 \+30m/);
  assert.match(stale.content[0].text, /15:00 \+30m/);
  assert.equal((await call("get_timeline", { name: made.name })).structuredContent.version, updated.structuredContent.version, "nothing saved");

  // update needs an existing timeline; get of a missing one says so.
  assert.equal((await call("update_timeline", { name: "no-such-thing", text: RECIPE })).isError, true);
  assert.match((await call("get_timeline", { name: "no-such-thing" })).content[0].text, /create_timeline/);
});

test("create never overwrites: a taken or reserved name is an error", async () => {
  const { call, env } = setup();
  const first = await call("create_timeline", { text: DAY, name: "my-day" });
  assert.equal(first.structuredContent.url, "https://tl.gaup.uk/my-day");
  assert.equal(first.structuredContent.kind, "day");
  assert.match(first.structuredContent.summary, /events?$/);
  const before = env.LINKS.store.get("doc:my-day").value;
  const again = await call("create_timeline", { text: RECIPE, name: "https://tl.gaup.uk/my-day" });
  assert.equal(again.isError, true);
  assert.match(again.content[0].text, /already taken/);
  assert.equal(env.LINKS.store.get("doc:my-day").value, before, "the first one is untouched");
  for (const name of ["mcp", "img", "Bad Name!", "x"]) assert.equal((await call("create_timeline", { text: DAY, name })).isError, true, name);
  assert.equal((await call("get_timeline", { name: "https://example.com/my-day" })).isError, true, "only tl.gaup.uk links");
});

test("invalid text comes back as isError with the parser's line message, and nothing is saved", async () => {
  const { call, env } = setup();
  const bad = await call("create_timeline", { text: "title: Oops\n+1m | Warm up\n5:00 PM | Dinner\n" });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /^Line 3: a routine uses lengths, not clock times/);
  const junk = await call("create_timeline", { text: "title: X\n08:00 | A\nthis is not a line\n" });
  assert.match(junk.content[0].text, /^Line 3: expected/);
  assert.equal((await call("create_timeline", { text: "  " })).isError, true);
  assert.equal(env.LINKS.store.size, 0);
  const huge = await call("create_timeline", { text: "title: Big\n08:00 | A | " + "x".repeat(101 * 1024) });
  assert.match(huge.content[0].text, /100 KB/);
});

test("data: image URIs are refused; https pictures are fine", async () => {
  const { call, env } = setup();
  const text = "title: Core\n+45s | Plank | | | sky | data:image/png;base64,iVBORw0KGgo=\n";
  const refused = await call("create_timeline", { text });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /^Line 2: data: URIs are not accepted/);
  const asset = await call("create_timeline", { text: "title: Core\nasset plank: data:image/webp;base64,UklGR\n+45s | Plank | | | sky | @plank\n" });
  assert.equal(asset.isError, true);
  assert.equal(env.LINKS.store.size, 0);
  const ok = await call("create_timeline", { text: "title: Core\n+45s | Plank | | | sky | https://example.com/plank.jpg\n" });
  assert.equal(ok.isError, undefined, ok.content[0].text);
});

test("control_run drives a routine's RunRoom and refuses a day plan", async () => {
  const { call, advance } = setup();
  const workout = (await call("create_timeline", { text: WORKOUT, name: "core-test" })).structuredContent;
  const idle = await call("control_run", { name: workout.name, op: "status" });
  assert.equal(idle.structuredContent.state, "idle");
  assert.equal(idle.structuredContent.total, "10 min");
  const started = await call("control_run", { name: workout.url, op: "start" });
  assert.equal(started.structuredContent.state, "running");
  assert.equal(started.structuredContent.current_step.title, "Jog in place");
  assert.match(started.content[0].text, /\[the timeline\]\(https:\/\/tl\.gaup\.uk\/core-test\)/);
  advance(70_000);
  const status = (await call("control_run", { name: "core-test", op: "status" })).structuredContent;
  assert.equal(status.elapsed, "1:10");
  assert.equal(status.current_step.title, "Plank");
  assert.equal(status.current_step.left, "0:35");
  assert.equal(status.next_step.title, "Rest");
  assert.equal(status.next_step.starts_in, "0:35");
  // start while running leaves the run alone.
  const again = (await call("control_run", { name: "core-test", op: "start" })).structuredContent;
  assert.equal(again.elapsed, "1:10");
  assert.match(again.note, /already going/);
  assert.equal((await call("control_run", { name: "core-test", op: "pause" })).structuredContent.state, "paused");
  advance(30_000);
  assert.equal((await call("control_run", { name: "core-test", op: "status" })).structuredContent.elapsed, "1:10", "paused time does not count");
  assert.equal((await call("control_run", { name: "core-test", op: "resume" })).structuredContent.state, "running");
  assert.equal((await call("control_run", { name: "core-test", op: "stop" })).structuredContent.state, "idle");

  const day = (await call("create_timeline", { text: DAY })).structuredContent;
  const refused = await call("control_run", { name: day.name, op: "start" });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /day plan/);
  assert.equal((await call("control_run", { name: "core-test", op: "explode" })).isError, true);
});

test("batches, notifications and malformed messages", async () => {
  const { post } = setup();
  const batch = await post([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "nope" },
    { id: 4, method: "ping" },
  ]);
  assert.equal(batch.status, 200);
  const answers = await batch.json();
  assert.deepEqual(
    answers.map((a) => a.id),
    [1, 2, 3, 4],
    "one answer per request, none for the notification",
  );
  assert.equal(answers[0].result.protocolVersion, "2025-03-26");
  assert.equal(answers[1].result.tools.length, 5);
  assert.equal(answers[2].error.code, -32601);
  assert.equal(answers[3].error.code, -32600, "no jsonrpc: 2.0");
  const onlyNotes = await post([{ jsonrpc: "2.0", method: "notifications/initialized" }]);
  assert.equal(onlyNotes.status, 202);
  const parse = await post("{not json");
  assert.equal(parse.status, 400);
  assert.equal((await parse.json()).error.code, -32700);
  assert.equal((await (await post([])).json()).error.code, -32600);
  assert.equal((await (await post({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "rm_rf" } })).json()).error.code, -32602);
});

test("GET and DELETE are 405; CORS is open; mcp is a reserved name", async () => {
  const { env } = setup();
  for (const method of ["GET", "DELETE"]) {
    const response = await worker.fetch(new Request("https://tl.gaup.uk/mcp", { method }), env);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }
  const preflight = await worker.fetch(new Request("https://tl.gaup.uk/mcp", { method: "OPTIONS", headers: { origin: "https://chatgpt.com" } }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-headers"), /mcp-protocol-version/);
  const put = await worker.fetch(new Request("https://tl.gaup.uk/mcp", { method: "PUT", body: "t=dGl0bGU6IFQKMDg6MDAgfCBB" }), env);
  assert.equal(put.status, 405, "PUT /mcp is the connector's, not a timeline");
});

test("the rate limit answers 429 before any work", async () => {
  let asked = 0;
  const { post, env } = setup({ MCP: { limit: async ({ key }) => (asked++, assert.equal(key, "203.0.113.9"), { success: false }) } });
  const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_timeline", arguments: { text: RECIPE } } }, { "cf-connecting-ip": "203.0.113.9" });
  assert.equal(response.status, 429);
  assert.match((await response.json()).error.message, /Too many requests/);
  assert.equal(asked, 1);
  assert.equal(env.LINKS.store.size, 0);
});

test("a 2026-07-28 client is served per request, with server/discover", async () => {
  const { post } = setup();
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
  const headers = { "mcp-protocol-version": "2026-07-28" };
  const discover = await (await post({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } }, { ...headers, "mcp-method": "server/discover" })).json();
  assert.equal(discover.result.resultType, "complete");
  assert.ok(discover.result.supportedVersions.includes("2026-07-28"));
  assert.match(discover.result.instructions, /format_guide/);
  assert.equal(discover.result._meta["io.modelcontextprotocol/serverInfo"].name, "timeline-studio");
  const list = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } }, { ...headers, "mcp-method": "tools/list" })).json();
  assert.equal(list.result.tools.length, 5);
  assert.equal(typeof list.result.ttlMs, "number");
  const created = await (
    await post(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { _meta: meta, name: "create_timeline", arguments: { text: WORKOUT } } },
      { ...headers, "mcp-method": "tools/call", "mcp-name": "create_timeline" },
    )
  ).json();
  assert.equal(created.result.resultType, "complete");
  assert.equal(created.result.structuredContent.kind, "routine");
  const old = await post({ jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "2030-01-01" } } });
  assert.equal(old.status, 400);
  assert.equal((await old.json()).error.code, -32022);
  const mismatch = await post({ jsonrpc: "2.0", id: 5, method: "tools/list", params: { _meta: meta } }, { ...headers, "mcp-method": "tools/call" });
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).error.code, -32020);
  const missing = await post({ jsonrpc: "2.0", id: 6, method: "resources/list", params: { _meta: meta } });
  assert.equal(missing.status, 404, "an unknown method is a 404 for a modern client");
});

test("every tool's schema is plain JSON Schema a strict client accepts", () => {
  for (const tool of TOOLS) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    for (const required of tool.inputSchema.required || []) assert.ok(tool.inputSchema.properties[required], `${tool.name}.${required}`);
  }
});
