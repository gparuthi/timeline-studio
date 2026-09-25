// The synced run: the RunRoom Durable Object, its routes, the client
// transport's clock-skew estimate and fallback, and CalDAV staying out of
// routines. Run: node --test tests/*.test.*
import test from "node:test";
import assert from "node:assert/strict";
import TimelineText from "../timeline-renderer.js";
import worker from "../worker/src/index.js";
import { RunRoom, checkOp } from "../worker/src/runroom.js";
import { handleDav } from "../worker/src/caldav.js";

const core = TimelineText.runCore();

function room(clock) {
  const data = new Map(),
    sockets = [];
  const ctx = {
    storage: {
      get: async (key) => (data.has(key) ? structuredClone(data.get(key)) : undefined),
      put: async (key, value) => void data.set(key, structuredClone(value)),
      delete: async (key) => data.delete(key),
    },
    getWebSockets: () => sockets,
    acceptWebSocket: (ws) => sockets.push(ws),
  };
  const socket = () => {
    const ws = { sent: [], send: (m) => ws.sent.push(JSON.parse(m)), close() {} };
    sockets.push(ws);
    return ws;
  };
  return { instance: new RunRoom(ctx, {}, clock), ctx, data, socket };
}

test("ops are checked before they reach the room", () => {
  assert.deepEqual(checkOp({ op: "start", runId: "x" }), { op: "start" });
  assert.deepEqual(checkOp({ op: "seek", shiftMs: "1500.4" }), { op: "seek", shiftMs: 1500 });
  for (const bad of [null, "start", {}, { op: "explode" }, { op: "seek" }, { op: "seek", shiftMs: 1e12 }, { op: "ping" }]) assert.equal(checkOp(bad), null);
});

test("the room applies ops on its own clock, keeps the state and tells every page", async () => {
  let now = 1_000_000;
  const { instance, data, socket } = room(() => now);
  const a = socket(),
    b = socket();
  await instance.webSocketMessage(a, JSON.stringify({ op: "start" }));
  assert.equal(data.get("state").startedAt, 1_000_000);
  assert.equal(b.sent.at(-1).state.startedAt, 1_000_000);
  assert.equal(b.sent.at(-1).now, 1_000_000);
  now += 5000;
  await instance.webSocketMessage(b, JSON.stringify({ op: "pause" }));
  assert.equal(a.sent.at(-1).state.pausedAt, 1_005_000, "a pause on one page reaches the other");
  now += 2000;
  await instance.webSocketMessage(a, JSON.stringify({ op: "ping", t: 42 }));
  assert.deepEqual(a.sent.at(-1), { pong: 42, now: 1_007_000 });
  assert.equal(b.sent.length, 2, "a ping is answered to its sender only");
  await instance.webSocketMessage(a, "not json");
  await instance.webSocketMessage(a, JSON.stringify({ op: "explode" }));
  assert.equal(b.sent.length, 2, "junk changes nothing");
  // A hibernated room wakes with its state from storage.
  const again = new RunRoom({ storage: { get: async () => data.get("state") }, getWebSockets: () => [] }, {}, () => now);
  assert.equal((await again.load()).pausedAt, 1_005_000);
  await instance.webSocketMessage(b, JSON.stringify({ op: "stop" }));
  assert.equal(data.has("state"), false);
  assert.equal(a.sent.at(-1).state, null, "stop ends it everywhere");
});

// A fake Durable Object namespace whose stubs are RunRooms.
function runs(clock) {
  const rooms = new Map();
  return {
    rooms,
    idFromName: (name) => "id:" + name,
    get(id) {
      if (!rooms.has(id)) rooms.set(id, room(clock).instance);
      return rooms.get(id);
    },
  };
}

test("GET /run/<name>.json polls the room and POST /run/<name> sends an op", async () => {
  let now = 50_000;
  const env = { RUNS: runs(() => now) };
  const ask = (path, init) => worker.fetch(new Request("https://tl.gaup.uk" + path, init), env);
  assert.deepEqual(await (await ask("/run/core-abc12.json")).json(), { state: null, now: 50_000 });
  const started = await (await ask("/run/core-abc12", { method: "POST", body: JSON.stringify({ op: "start" }) })).json();
  assert.equal(started.state.startedAt, 50_000);
  now = 53_000;
  const polled = await (await ask("/run/core-abc12.json")).json();
  assert.equal(core.elapsedMs(polled.state, polled.now), 3000);
  assert.equal((await ask("/run/other-name.json").then((r) => r.json())).state, null, "one room per name");
  assert.equal((await ask("/run/core-abc12", { method: "POST", body: "{}" })).status, 400);
  assert.equal((await ask("/run/core-abc12")).status, 400, "a plain GET is neither a socket nor a poll");
  assert.equal((await ask("/run/Bad_Name.json")).status, 404);
  assert.equal((await worker.fetch(new Request("https://tl.gaup.uk/run/x-y.json"), {})).status, 404);
});

// A fake clock and timers for the client transport.
function world(start = 0) {
  let t = start;
  const timers = [];
  return {
    clock: () => t,
    setTimeout(fn, ms) {
      const timer = { at: t + ms, fn };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      const i = timers.indexOf(timer);
      if (i >= 0) timers.splice(i, 1);
    },
    async advance(ms) {
      const flush = async () => {
        for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      };
      await flush();
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        if (!timers.length || timers[0].at > end) break;
        const timer = timers.shift();
        t = Math.max(t, timer.at);
        timer.fn();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}

test("each page estimates the server's clock from the quickest round trip, so pages agree", async () => {
  const serverTime = { t: 1_000_000 };
  // Page A's clock runs 5 s fast, B's 3 s slow; both see 80-200 ms round trips.
  const pages = [5000, -3000].map((skew) => {
    const w = world(serverTime.t + skew);
    const sockets = [];
    class FakeSocket {
      constructor(url) {
        this.url = url;
        this.sent = [];
        sockets.push(this);
      }
      send(m) {
        this.sent.push(JSON.parse(m));
      }
      close() {}
    }
    const transport = TimelineText.syncTransport({ base: "https://tl.gaup.uk/", name: "core-abc12", core, WebSocket: FakeSocket, fetch: null, document: null, ...w });
    return { w, sockets, transport, skew };
  });
  assert.equal(pages[0].sockets[0].url, "wss://tl.gaup.uk/run/core-abc12");
  const serverState = core.apply(null, { op: "start" }, 1_000_000);
  for (const page of pages) {
    const ws = page.sockets[0];
    ws.onopen();
    // A broadcast first: a rough guess until a ping returns.
    ws.onmessage({ data: JSON.stringify({ state: serverState, now: 1_000_000 }) });
    for (const [rtt, delay] of [
      [200, 0],
      [80, 0],
      [150, 0],
    ]) {
      await page.w.advance(delay + 1000);
      const sentAt = page.w.clock();
      await page.w.advance(rtt);
      // The server read its clock half-way through the round trip.
      ws.onmessage({ data: JSON.stringify({ pong: sentAt, now: sentAt - page.skew + rtt / 2 }) });
    }
  }
  const [a, b] = pages;
  assert.ok(a.sockets[0].sent.some((m) => m.op === "ping"));
  assert.equal(a.transport.skew().rtt, 80, "the quickest round trip wins");
  // Same moment in real time: both pages compute the same elapsed time.
  const trueNow = a.w.clock() - a.skew;
  await b.w.advance(trueNow - (b.w.clock() - b.skew));
  const ea = core.elapsedMs(a.transport.get(), a.transport.now()),
    eb = core.elapsedMs(b.transport.get(), b.transport.now());
  assert.ok(Math.abs(ea - eb) < 50, `pages agree: ${ea} vs ${eb}`);
  assert.ok(Math.abs(ea - (trueNow - 1_000_000)) < 50, "and agree with the server");
  a.transport.close();
  b.transport.close();
});

test("a page whose socket drops polls every 3 s, sends ops by POST and reconnects with backoff", async () => {
  const w = world(10_000),
    sockets = [],
    requests = [];
  let serverState = null;
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      sockets.push(this);
    }
    send(m) {
      this.sent.push(JSON.parse(m));
    }
    close() {}
  }
  const fakeFetch = async (url, init = {}) => {
    requests.push([init.method || "GET", url]);
    if (init.method === "POST") serverState = core.apply(serverState, JSON.parse(init.body), w.clock());
    return { ok: true, json: async () => ({ state: serverState, now: w.clock() }) };
  };
  let heard = 0;
  const transport = TimelineText.syncTransport({ base: "https://tl.gaup.uk", name: "core-abc12", core, WebSocket: FakeSocket, fetch: fakeFetch, document: null, ...w });
  transport.subscribe(() => heard++);
  sockets[0].onerror();
  await w.advance(0);
  assert.deepEqual(requests[0], ["GET", "https://tl.gaup.uk/run/core-abc12.json"]);
  transport.send({ op: "start" });
  assert.ok(transport.get(), "the tap shows at once");
  await w.advance(0);
  assert.deepEqual(requests.at(-1), ["POST", "https://tl.gaup.uk/run/core-abc12"]);
  assert.equal(transport.get().startedAt, 10_000);
  // A poll sent before the op but answered after it does not undo it.
  let late;
  const slow = TimelineText.syncTransport({
    base: "https://tl.gaup.uk/",
    name: "x-y-z",
    core,
    WebSocket: null,
    document: null,
    ...world(0),
    fetch: (url, init = {}) =>
      init.method === "POST"
        ? Promise.resolve({ ok: true, json: async () => ({ state: core.apply(null, { op: "start" }, 5), now: 5 }) })
        : new Promise((resolve) => (late = () => resolve({ ok: true, json: async () => ({ state: null, now: 1 }) }))),
  });
  slow.send({ op: "start" });
  await new Promise((r) => setImmediate(r));
  late();
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.ok(slow.get(), "the older poll reply is dropped");
  slow.close();
  await w.advance(3000);
  assert.equal(requests.filter(([m]) => m === "GET").length >= 2, true, "polls every 3 s");
  // Reconnects after 1 s, then 2 s, 4 s… while the socket keeps failing.
  assert.equal(sockets.length >= 2, true);
  const polls = requests.length;
  sockets.at(-1).onopen();
  await w.advance(9000);
  assert.equal(requests.length, polls, "no polling while the socket is up");
  transport.send({ op: "pause" });
  assert.deepEqual(sockets.at(-1).sent.at(-1), { op: "pause" }, "ops go over the socket when it is up");
  assert.ok(heard >= 3);
  transport.close();
});

test("a socket that stops answering pings is dropped, and the page reconnects and polls", async () => {
  const w = world(0),
    sockets = [],
    requests = [];
  class FakeSocket {
    constructor() {
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }
    send(m) {
      this.sent.push(JSON.parse(m));
    }
    close() {
      this.closed = true;
    }
  }
  const fakeFetch = async (url) => (requests.push(url), { ok: true, json: async () => ({ state: null, now: w.clock() }) });
  const transport = TimelineText.syncTransport({ base: "https://tl.gaup.uk/", name: "core-abc12", core, WebSocket: FakeSocket, fetch: fakeFetch, document: null, ...w });
  sockets[0].onopen();
  // It answers at first...
  await w.advance(0);
  sockets[0].onmessage({ data: JSON.stringify({ pong: sockets[0].sent.at(-1).t, now: w.clock() }) });
  // ...then goes silent: pings pile up unanswered.
  await w.advance(60000);
  assert.equal(sockets[0].closed, true, "the silent socket is dropped");
  assert.ok(sockets.length >= 2, "and a new one is opened");
  assert.ok(requests.some((u) => u.endsWith("/run/core-abc12.json")), "polling covers the gap");
  transport.close();
});

test("a routine's calendar is empty and read-only", async () => {
  const text = "title: Core\nclock: relative\n+45s | Plank\n+15s | Rest\n";
  const deps = { loadDoc: async () => ({ name: "core", text, version: "v1" }), saveDoc: async () => assert.fail("must not save") };
  const env = { LINKS: { get: async () => null, put: async () => {} } };
  const auth = { authorization: "Basic " + btoa("core:x") };
  const put = await handleDav(
    new Request("https://tl.gaup.uk/dav/core/cal/new-event.ics", {
      method: "PUT",
      headers: auth,
      body: "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260606T090000Z\r\nDTEND:20260606T100000Z\r\nSUMMARY:Sneaky\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
    }),
    env,
    deps,
  );
  assert.equal(put.status, 403);
  const del = await handleDav(new Request("https://tl.gaup.uk/dav/core/cal/core-plank.ics", { method: "DELETE", headers: auth }), env, deps);
  assert.equal(del.status, 403);
  const list = await handleDav(new Request("https://tl.gaup.uk/dav/core/cal/", { method: "PROPFIND", headers: { ...auth, depth: "1" } }), env, deps);
  const xml = await list.text();
  assert.equal((xml.match(/<D:response>/g) || []).length, 1, "the calendar and no events");
  assert.match(xml, /<D:current-user-privilege-set><D:privilege><D:read\/><\/D:privilege><\/D:current-user-privilege-set>/);
  assert.doesNotMatch(xml, /<D:write\/>/);
});

test("standalone pages run locally: rendered pages carry no sync code", () => {
  const page = TimelineText.render("title: T\nclock: relative\n+45s | Plank\n+15s | Rest");
  assert.match(page, /function runRuntime/);
  assert.doesNotMatch(page, /syncTransport|\/run\//);
});
