// A routine's live run, shared by every page open on its link.
//
//   GET  /run/<name>        WebSocket (hibernation API). The server sends
//                           { state, now } on connect and after every change;
//                           a client sends { op: "start" | "pause" | "resume"
//                           | "seek" | "stop", shiftMs? }, or { op: "ping", t }
//                           which is answered { pong: t, now } so the client
//                           can estimate its clock skew from the round trip.
//   GET  /run/<name>.json   { state, now }: the polling fallback for a page
//                           whose socket is down.
//   POST /run/<name>        an op as JSON -> { state, now }, for the same page.
//
// One RunRoom per link name (idFromName). The state is the same small object
// the local run keeps ({ runId, startedAt, pausedAt, pausedMs, shiftMs,
// updatedAt }); `now` and every timestamp in it are the server's clock, and
// elapsed time is always computed from it, never counted (see runCore in
// timeline-renderer.js, which applies the ops here too). The room knows
// nothing of the steps: the pages have the text, and the page that sees the
// end first sends "stop".
//
// Caps (docs/limits.md §2): at most 20 open sockets per room (the next one
// is closed with a reason, and that page polls .json instead), and at most
// 10 ops a second per room (more are dropped, or 429 for a POST).
//
// A plain class rather than an extension of cloudflare:workers'
// DurableObject, so node can import it for the tests; the hibernation API
// (ctx.acceptWebSocket, webSocketMessage) works the same either way.

import TimelineText from "../../timeline-renderer.js";

const core = TimelineText.runCore();
const OPS = new Set(["start", "pause", "resume", "seek", "stop"]);
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_SOCKETS = 20;
export const MAX_OPS_PER_SECOND = 10;

// A well-formed op, or null.
export function checkOp(op) {
  if (!op || typeof op !== "object" || !OPS.has(op.op)) return null;
  if (op.op !== "seek") return { op: op.op };
  const shiftMs = Number(op.shiftMs);
  if (!Number.isFinite(shiftMs) || Math.abs(shiftMs) > DAY_MS) return null;
  return { op: "seek", shiftMs: Math.round(shiftMs) };
}

export class RunRoom {
  constructor(ctx, env, clock = () => Date.now()) {
    this.ctx = ctx;
    this.env = env;
    this.clock = clock;
    this.state = undefined;
    this.recent = []; // when the last ops were applied, for the per-second cap
  }

  async load() {
    if (this.state === undefined) this.state = (await this.ctx.storage.get("state")) ?? null;
    return this.state;
  }

  message(extra = {}) {
    return JSON.stringify({ state: this.state ?? null, now: this.clock(), ...extra });
  }

  async fetch(request) {
    if ((request.headers.get("upgrade") || "").toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const full = this.ctx.getWebSockets().length >= MAX_SOCKETS;
      this.ctx.acceptWebSocket(server);
      if (full) {
        server.close(1013, "Room full: poll /run/<name>.json");
        return new Response(null, { status: 101, webSocket: client });
      }
      await this.load();
      server.send(this.message());
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === "POST") {
      let op = null;
      try {
        op = checkOp(await request.json());
      } catch (error) {
        op = null;
      }
      if (!op) return reply({ error: "Expected { op: start | pause | resume | seek | stop }" }, 400);
      if (!(await this.apply(op))) return reply({ error: "Too many run changes, try again in a second" }, 429);
      return reply(JSON.parse(this.message()));
    }
    await this.load();
    return reply(JSON.parse(this.message()));
  }

  async webSocketMessage(ws, data) {
    let op;
    try {
      op = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
    } catch (error) {
      return;
    }
    if (op && op.op === "ping") {
      ws.send(JSON.stringify({ pong: Number(op.t) || 0, now: this.clock() }));
      return;
    }
    const checked = checkOp(op);
    if (checked) await this.apply(checked);
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch (error) {
      /* already closed */
    }
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, "error");
    } catch (error) {}
  }

  // Apply an op with the server's clock, keep the result, tell every page.
  // False when this second's ops are used up (the op is dropped).
  async apply(op) {
    const now = this.clock();
    this.recent = this.recent.filter((t) => now - t < 1000);
    if (this.recent.length >= MAX_OPS_PER_SECOND) return false;
    this.recent.push(now);
    await this.load();
    this.state = core.apply(this.state, op, this.clock());
    if (this.state) await this.ctx.storage.put("state", this.state);
    else await this.ctx.storage.delete("state");
    const message = this.message();
    for (const ws of this.ctx.getWebSockets())
      try {
        ws.send(message);
      } catch (error) {
        /* a socket on its way out */
      }
    return true;
  }
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });
}
