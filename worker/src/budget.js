// Cost guards (docs/limits.md): a global daily budget on everything that
// writes, stores or calls AI, so no stranger can run up the bill.
//
// One Durable Object instance (Budget, idFromName("global")) keeps the
// counters: per UTC day for every kind, and one all-time total of stored
// image bytes. The worker asks it once before each costly operation
// (never on page views, reads or static assets):
//
//   POST /take   { kind, amount } -> { ok, kind, used, cap, resets_at }
//   POST /total  { bytes }        -> sets img_total (the weekly recount)
//   GET  /usage                   -> { day, kinds: { <kind>: { used, cap } }, img_total }
//
// A Durable Object handles one request at a time and its storage calls
// keep other requests out until they finish, so a take is atomic.
//
// A refusal is a BudgetError: HTTP 429 { error: "daily-limit", kind,
// resets_at } or an MCP isError in words. When the Budget itself fails,
// AI, images and fetches fail closed (refused) and everything else fails
// open, so an outage never loses someone's typing.
//
// A plain class, not an extension of cloudflare:workers' DurableObject, so
// node can import it for the tests (like RunRoom).

const MB = 1024 * 1024;

// The caps: one place, a one-line edit and a deploy.
export const CAPS = {
  ai: 300, // /command + /places calls; stays under Workers AI's 10k free neurons a day
  img_count: 300, // new pictures (a duplicate is free)
  img_bytes: 200 * MB, // bytes of new pictures a day
  img_total: 1024 * MB, // bytes of pictures stored, all-time
  doc_new: 500, // new timeline names
  doc_save: 20000, // KV writes of a timeline
  mcp: 5000, // MCP tools/call
  fetch: 500, // server-side fetches (upload_image url, POST /img url, /resolve)
};
// Kinds counted for all time rather than per day.
const ALL_TIME = new Set(["img_total"]);
// Kinds refused when the Budget cannot be asked.
export const FAIL_CLOSED = new Set(["ai", "img_count", "img_bytes", "img_total", "fetch"]);
// In words, for messages.
export const KIND_LABELS = {
  ai: "AI edits",
  img_count: "picture uploads",
  img_bytes: "picture uploads",
  img_total: "stored pictures",
  doc_new: "new timelines",
  doc_save: "saving timelines",
  mcp: "connector calls",
  fetch: "fetching links",
};

export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
// The next UTC midnight after `ms`, as an ISO string.
export const resetsAt = (ms) => {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
};

export class BudgetError extends Error {
  constructor(kind, resets, unavailable = false) {
    const what = KIND_LABELS[kind] || kind;
    super(
      unavailable
        ? `The usage counter for ${what} is not answering, so this is refused for now. Try again in a minute.`
        : ALL_TIME.has(kind)
          ? `The storage limit for ${what} is reached. Nothing more can be stored until old pictures expire.`
          : `The daily limit for ${what} is reached. It resets at ${resets.slice(11, 16)} UTC.`,
    );
    this.kind = kind;
    this.resets_at = resets || null;
    this.unavailable = unavailable;
  }
  // The HTTP answer: 429 for a limit, 503 when the counter is down.
  get status() {
    return this.unavailable ? 503 : 429;
  }
  body() {
    return this.unavailable
      ? { error: "budget-unavailable", kind: this.kind, message: this.message }
      : { error: "daily-limit", kind: this.kind, resets_at: this.resets_at, message: this.message };
  }
}

export class Budget {
  constructor(ctx, env, clock = () => Date.now()) {
    this.ctx = ctx;
    this.env = env;
    this.clock = clock;
    this.state = undefined;
    this.caps = { ...CAPS, ...((env && env.BUDGET_CAPS) || {}) };
  }

  async load() {
    if (this.state === undefined) this.state = (await this.ctx.storage.get("state")) ?? { day: "", counts: {}, img_total: 0 };
    // A new UTC day starts the daily counters from zero.
    const day = dayOf(this.clock());
    if (this.state.day !== day) this.state = { day, counts: {}, img_total: this.state.img_total || 0 };
    return this.state;
  }

  async save() {
    await this.ctx.storage.put("state", this.state);
  }

  used(kind) {
    return ALL_TIME.has(kind) ? this.state.img_total || 0 : this.state.counts[kind] || 0;
  }

  async take(kind, amount) {
    await this.load();
    const cap = this.caps[kind],
      used = this.used(kind),
      resets_at = resetsAt(this.clock());
    if (used + amount > cap) return { ok: false, kind, used, cap, resets_at };
    if (ALL_TIME.has(kind)) this.state.img_total = used + amount;
    else this.state.counts[kind] = used + amount;
    await this.save();
    return { ok: true, kind, used: used + amount, cap, resets_at };
  }

  async usage() {
    await this.load();
    const kinds = {};
    for (const kind of Object.keys(this.caps)) if (!ALL_TIME.has(kind)) kinds[kind] = { used: this.used(kind), cap: this.caps[kind] };
    return { day: this.state.day, resets_at: resetsAt(this.clock()), kinds, img_total: { used: this.state.img_total || 0, cap: this.caps.img_total } };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET") return reply(await this.usage());
    let body = null;
    try {
      body = await request.json();
    } catch (error) {}
    if (url.pathname === "/take") {
      const kind = body && body.kind,
        amount = Math.round(Number(body && body.amount));
      if (!Object.hasOwn(this.caps, kind) || !Number.isFinite(amount) || amount < 0) return reply({ error: "Expected { kind, amount }" }, 400);
      return reply(await this.take(kind, amount));
    }
    if (url.pathname === "/total") {
      const bytes = Math.round(Number(body && body.bytes));
      if (!Number.isFinite(bytes) || bytes < 0) return reply({ error: "Expected { bytes }" }, 400);
      await this.load();
      this.state.img_total = bytes;
      await this.save();
      return reply(await this.usage());
    }
    return reply({ error: "Not found" }, 404);
  }
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

// The worker's side: take(kind, amount) asks the Budget and throws a
// BudgetError on a refusal. Without the binding (tests, local copies) it
// allows everything.
export function budget(env) {
  const stub = () => env.BUDGET.get(env.BUDGET.idFromName("global"));
  async function take(kind, amount = 1) {
    if (!env || !env.BUDGET) return;
    let answer;
    try {
      const response = await stub().fetch(
        new Request("https://budget/take", { method: "POST", body: JSON.stringify({ kind, amount }), headers: { "content-type": "application/json" } }),
      );
      answer = await response.json();
      if (!response.ok) throw new Error(answer.error || `budget ${response.status}`);
    } catch (error) {
      if (FAIL_CLOSED.has(kind)) throw new BudgetError(kind, null, true);
      return; // fail open: a counter outage never loses a save
    }
    if (!answer.ok) throw new BudgetError(kind, answer.resets_at);
  }
  async function usage() {
    const response = await stub().fetch(new Request("https://budget/usage"));
    return response.json();
  }
  async function setTotal(bytes) {
    const response = await stub().fetch(new Request("https://budget/total", { method: "POST", body: JSON.stringify({ bytes }), headers: { "content-type": "application/json" } }));
    return response.json();
  }
  return { take, usage, setTotal };
}
