// The MCP connector: ChatGPT and Claude make and edit timelines with tools
// instead of building a long #text= link (docs/mcp.md).
//
//   POST /mcp     JSON-RPC 2.0, one message or a batch -> application/json
//   GET / DELETE  405 (no SSE stream, no sessions)
//
// Stateless Streamable HTTP, hand-rolled because the Worker has no npm
// dependencies and the surface is small. Both protocol eras are served on
// the one endpoint: a client that opens with `initialize` gets the
// handshake revisions (2024-11-05 .. 2025-11-25: initialize, the
// initialized notification, ping); a client that puts its version in each
// request's `_meta` (2026-07-28 and later) is answered per request and can
// ask `server/discover`. Nothing is kept between requests either way.
//
// No sign-in, the same model as the links: a name is the whole capability.
// The guards are the MCP rate limit (60 requests a minute per address),
// 100 KB of text at most, and create never overwrites.
//
// Every tool result carries structuredContent and a text block with a
// Markdown link, for chats that show only the text. A bad timeline comes
// back as a tool result with isError and the parser's own "Line 7: …"
// message, so the model can fix the line and call again.

import TimelineText from "../../timeline-renderer.js";

const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MODERN_VERSIONS = ["2026-07-28"];
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER = "io.modelcontextprotocol/serverInfo";
const SERVER_INFO = { name: "timeline-studio", title: "Timeline Studio", version: "1.0.0", websiteUrl: "https://tl.gaup.uk/" };
const MAX_TEXT = 100 * 1024; // bytes of timeline text
const MAX_BODY = 256 * 1024; // a request, JSON escaping included
const MAX_PAYLOAD = 64 * 1024; // what the studio's own save (PUT) accepts
const NAME = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const HOSTS = new Set(["tl.gaup.uk", "www.tl.gaup.uk"]);
const DATA_URI = /\bdata:[a-z]+\/[a-z0-9.+-]+[;,]/i;
const OPS = ["start", "pause", "resume", "stop", "status"];
const KINDS = ["day", "trip", "workout", "recipe"];

export const INSTRUCTIONS = `Timeline Studio turns a small plain-text format into a timeline page with a short link (https://tl.gaup.uk/<name>) that works on any phone.

- Pick the kind first. A day plan or a trip happens at times of day, on dates: clock times (08:00, 2:30 PM) and a date or day: lines. Anything done from a Start moment as timed steps (a workout, a recipe, a practice or cleaning routine) is a routine: every step starts with its length (+45s | Plank, +15m | Preheat the oven), with no clock times and no date. If the person names a time ("dinner at 7"), tell them when to press Start instead.
- Call format_guide with the kind before you write the first timeline in a chat. It has the rules and a worked example.
- create_timeline checks and saves the text and returns its link. To change a timeline, call get_timeline, edit the text (keep every line you do not need to change exactly as it was), then update_timeline with the version you read. On a conflict, redo your change on the current text it returns.
- If a call says "Line N: …", fix that line and call again.
- Always give the person the returned link as a Markdown link. Do not paste the whole text unless they ask.
- control_run starts, pauses, resumes, stops or reads the live run of a routine; every phone or TV with the link open follows it.`;

const nameProperty = {
  type: "string",
  description: 'The timeline\'s name, or its link: "sheet-pan-k3x9p", "https://tl.gaup.uk/sheet-pan-k3x9p" or "tl.gaup.uk/sheet-pan-k3x9p".',
};
const textProperty = {
  type: "string",
  maxLength: MAX_TEXT,
  description:
    "The complete timeline in Timeline Studio's plain-text format (see format_guide): a title: line, settings, then one event per line. A day plan: `08:00 | Coffee | Neighborhood bakery | coffee | sand`. A routine: steps that each start with their length, `+45s | Plank | Elbows under shoulders`, no clock times. Plain text only, no Markdown. Pictures must be https:// image URLs you know exist; data: URIs are refused.",
};

export const TOOLS = [
  {
    name: "format_guide",
    title: "Timeline format guide",
    description:
      "Returns the Timeline Studio text format: the rules and a worked example for the kind of timeline. Call it before writing the first timeline in a chat. kind: day (a day plan with clock times), trip (several dated days), workout or recipe (a routine of timed steps run from a Start button). Leave kind out for the whole guide.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: KINDS, description: "day, trip, workout or recipe. Leave it out for everything." },
      },
      additionalProperties: false,
    },
    annotations: { title: "Timeline format guide", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "create_timeline",
    title: "Create a timeline",
    description:
      "Checks the timeline text and saves it as a new timeline with its own short link. If the text has a mistake, nothing is saved and the error names the line (\"Line 7: …\"): fix it and call again. Never overwrites: without a name one is made from the title plus a random tail; a name that is already taken is an error (use update_timeline to change that one). Returns the link to give the person.",
    inputSchema: {
      type: "object",
      properties: {
        text: textProperty,
        name: {
          type: "string",
          description:
            "Optional. The name for the link (tl.gaup.uk/<name>): 3 to 32 characters, lowercase letters, digits and dashes. Leave it out unless the person asked for one; anyone who knows a name can open and edit it.",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: { title: "Create a timeline", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "get_timeline",
    title: "Get a timeline",
    description:
      "Loads a saved timeline's current text and version. Use it before changing a timeline (the person may have edited it on their phone), and pass the version to update_timeline.",
    inputSchema: { type: "object", properties: { name: nameProperty }, required: ["name"], additionalProperties: false },
    annotations: { title: "Get a timeline", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "update_timeline",
    title: "Update a timeline",
    description:
      "Replaces a saved timeline's text with the complete new text; the link stays the same and open pages update by themselves. The text is checked first (errors name the line). Pass the version from get_timeline: if the timeline changed since, nothing is saved and the result carries the current text and version, so redo your change on that text and call again. The timeline must exist (use create_timeline for a new one).",
    inputSchema: {
      type: "object",
      properties: {
        name: nameProperty,
        text: textProperty,
        version: { type: "string", description: "The version get_timeline or create_timeline returned. Recommended: it stops you overwriting someone else's edit." },
      },
      required: ["name", "text"],
      additionalProperties: false,
    },
    annotations: { title: "Update a timeline", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "control_run",
    title: "Control a routine's run",
    description:
      "Starts, pauses, resumes or stops the live run of a routine (a workout or recipe), or reads where it is (status). Every phone, tablet or TV with the timeline's link open follows the run with its countdown and beeps. Only for routines, not day plans. start begins from the first step (it does nothing while a run is already going; stop first to restart).",
    inputSchema: {
      type: "object",
      properties: {
        name: nameProperty,
        op: { type: "string", enum: OPS, description: "start, pause, resume, stop, or status to read where the run is." },
      },
      required: ["name", "op"],
      additionalProperties: false,
    },
    annotations: { title: "Control a routine's run", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

class RpcError extends Error {
  constructor(code, message, data, status = 200) {
    super(message);
    this.code = code;
    this.data = data;
    this.status = status;
  }
}

// deps: { loadDoc, saveDoc, encode, summary, reserved, cors } from index.js.
export async function handleMcp(request, env, deps) {
  const headers = { ...deps.cors, "cache-control": "no-store" };
  const reply = (body, status = 200) =>
    body === null
      ? new Response(null, { status, headers })
      : new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
  const failure = (id, code, message, status, data) => reply({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }, status);

  if (request.method !== "POST")
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed: POST JSON-RPC to /mcp" } }), {
      status: 405,
      headers: { ...headers, allow: "POST, OPTIONS", "content-type": "application/json; charset=utf-8" },
    });
  if (env.MCP) {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.MCP.limit({ key: ip });
    if (!success) return failure(null, -32000, "Too many requests: 60 a minute. Wait a minute and try again.", 429);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY) return failure(null, -32600, "Request too large", 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return failure(null, -32600, "Request too large", 413);
  let message;
  try {
    message = JSON.parse(raw);
  } catch (error) {
    return failure(null, -32700, "Parse error: the body is not JSON", 400);
  }
  const context = { request, env, deps, origin: originOf(request) };
  if (Array.isArray(message)) {
    if (!message.length) return failure(null, -32600, "Invalid Request: empty batch", 400);
    const answers = [];
    for (const item of message) {
      const answer = await dispatch(item, context);
      if (answer) answers.push(answer.body);
    }
    return answers.length ? reply(answers) : reply(null, 202);
  }
  const answer = await dispatch(message, context);
  return answer ? reply(answer.body, answer.status) : reply(null, 202);
}

// One JSON-RPC message -> { body, status } or null for a notification.
async function dispatch(message, context) {
  const object = message && typeof message === "object" && !Array.isArray(message);
  const valid = object && message.jsonrpc === "2.0" && typeof message.method === "string";
  const id = object ? message.id : undefined;
  if (!valid || (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number"))
    return { body: { jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid Request: expected a JSON-RPC 2.0 request" } }, status: 400 };
  const notification = !("id" in message);
  const params = message.params && typeof message.params === "object" ? message.params : {};
  const requested = params._meta && typeof params._meta === "object" ? params._meta[META_VERSION] : undefined;
  const modern = typeof requested === "string";
  try {
    if (modern) checkModern(message, params, requested, context.request);
    const result = await method(message.method, params, context, modern);
    if (notification) return null;
    const body = modern ? { resultType: "complete", ...result, _meta: { ...(result._meta || {}), [META_SERVER]: SERVER_INFO } } : result;
    return { body: { jsonrpc: "2.0", id: message.id, result: body }, status: 200 };
  } catch (error) {
    if (notification) return null;
    const rpc = error instanceof RpcError ? error : new RpcError(-32603, "Internal error: " + (error.message || error));
    return { body: { jsonrpc: "2.0", id: message.id, error: { code: rpc.code, message: rpc.message, ...(rpc.data ? { data: rpc.data } : {}) } }, status: rpc.status };
  }
}

// A modern request names its version in _meta (and the headers mirror it).
function checkModern(message, params, requested, request) {
  if (!MODERN_VERSIONS.includes(requested))
    throw new RpcError(-32022, "Unsupported protocol version", { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested }, 400);
  const header = (name) => request.headers.get(name);
  const mismatch = (what, sent, body) => new RpcError(-32020, `Header mismatch: ${what} header value '${sent}' does not match body value '${body}'`, undefined, 400);
  const version = header("mcp-protocol-version");
  if (version && version !== requested) throw mismatch("MCP-Protocol-Version", version, requested);
  const methodHeader = header("mcp-method");
  if (methodHeader && methodHeader !== message.method) throw mismatch("Mcp-Method", methodHeader, message.method);
  const nameHeader = header("mcp-name");
  if (nameHeader && message.method === "tools/call") {
    const sent = /^=\?base64\?(.*)\?=$/.test(nameHeader) ? new TextDecoder().decode(Uint8Array.from(atob(nameHeader.slice(9, -2)), (c) => c.charCodeAt(0))) : nameHeader;
    if (sent !== params.name) throw mismatch("Mcp-Name", sent, params.name);
  }
}

async function method(name, params, context, modern) {
  switch (name) {
    case "initialize": {
      const asked = String(params.protocolVersion || "");
      return {
        protocolVersion: LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };
    }
    case "server/discover":
      return {
        supportedVersions: [...MODERN_VERSIONS, ...LEGACY_VERSIONS],
        capabilities: { tools: {} },
        instructions: INSTRUCTIONS,
        ttlMs: 3600000,
        cacheScope: "public",
      };
    case "notifications/initialized":
    case "notifications/cancelled":
    case "ping":
      return {};
    case "tools/list":
      return modern ? { tools: TOOLS, ttlMs: 3600000, cacheScope: "public" } : { tools: TOOLS };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) throw new RpcError(-32602, `Unknown tool: ${params.name}. Tools: ${TOOLS.map((t) => t.name).join(", ")}`);
      const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {};
      try {
        return await CALLS[tool.name](args, context);
      } catch (error) {
        if (error instanceof ToolError) return toolError(error.message, error.structured);
        throw error;
      }
    }
    default:
      if (name.startsWith("notifications/")) return {};
      throw new RpcError(-32601, `Method not found: ${name}`, undefined, modern ? 404 : 200);
  }
}

// ---- tools ------------------------------------------------------------------

class ToolError extends Error {
  constructor(message, structured) {
    super(message);
    this.structured = structured;
  }
}

function toolResult(structured, text) {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

function toolError(text, structured) {
  return { content: [{ type: "text", text }], ...(structured ? { structuredContent: structured } : {}), isError: true };
}

const CALLS = {
  async format_guide(args, { env, request }) {
    const kind = args.kind === undefined || args.kind === null || args.kind === "" ? "" : String(args.kind).toLowerCase();
    if (kind && !KINDS.includes(kind)) throw new ToolError(`kind must be one of ${KINDS.join(", ")}, or left out.`);
    const source = await llmsText(env, request);
    const guide = formatGuide(source, kind);
    return toolResult({ kind: kind || "all", guide }, guide);
  },

  async create_timeline(args, context) {
    const { env, deps } = context;
    const text = await checkedText(args.text, deps);
    let name = "";
    if (args.name !== undefined && args.name !== null && String(args.name).trim() !== "") {
      name = nameFrom(args.name, deps.reserved);
      if (await deps.loadDoc(env, name))
        throw new ToolError(`“${name}” is already taken. Pick another name, or leave name out and one is made up. To change that timeline, use get_timeline and update_timeline.`);
    } else {
      const model = TimelineText.parse(text);
      for (let attempt = 0; attempt < 4 && !name; attempt++) {
        const candidate = madeUpName(model.title);
        if (!deps.reserved.has(candidate) && !(await deps.loadDoc(env, candidate))) name = candidate;
      }
      if (!name) throw new ToolError("Could not find a free name; try again.");
    }
    const doc = await deps.saveDoc(env, name, text);
    const facts = describe(doc.text, deps);
    const url = context.origin + name;
    const structured = { url, name, title: facts.title, kind: facts.kind, summary: facts.summary, version: doc.version };
    return toolResult(
      structured,
      `Saved “${facts.title || name}” (${facts.kind}: ${facts.summary}).\n\n[Open the timeline](${url})\n\nGive the person this link. It opens on any phone; to change it later use get_timeline and update_timeline with name "${name}" (version ${doc.version}).`,
    );
  },

  async get_timeline(args, context) {
    const { env, deps } = context;
    const name = nameFrom(args.name, deps.reserved);
    const doc = await deps.loadDoc(env, name);
    if (!doc) throw new ToolError(`There is no timeline at “${name}”. Use create_timeline to make one.`);
    let updated = null;
    if (env.LINKS && typeof env.LINKS.getWithMetadata === "function") {
      const { metadata } = await env.LINKS.getWithMetadata("doc:" + name);
      updated = (metadata && (metadata.updated || metadata.migrated)) || null;
    }
    const url = context.origin + name;
    const facts = describe(doc.text, deps);
    return toolResult(
      { url, name, title: facts.title, kind: facts.kind, summary: facts.summary, text: doc.text, version: doc.version, updated },
      `[${facts.title || name}](${url}) · ${facts.kind}: ${facts.summary} · version ${doc.version}${updated ? ` · updated ${updated}` : ""}\n\n\`\`\`text\n${doc.text.replace(/\n$/, "")}\n\`\`\``,
    );
  },

  async update_timeline(args, context) {
    const { env, deps } = context;
    const name = nameFrom(args.name, deps.reserved);
    const doc = await deps.loadDoc(env, name);
    if (!doc) throw new ToolError(`There is no timeline at “${name}”. Use create_timeline to make a new one.`);
    const url = context.origin + name;
    const version = args.version === undefined || args.version === null ? "" : String(args.version).trim();
    if (version && version !== doc.version)
      throw new ToolError(
        `Not saved: “${name}” changed since version ${version} (someone edited it). Its current version is ${doc.version}. Redo your change on the current text below, keeping the other edits, and call update_timeline again with version "${doc.version}".\n\n\`\`\`text\n${doc.text.replace(/\n$/, "")}\n\`\`\``,
        { error: "conflict", url, name, version: doc.version, text: doc.text },
      );
    const text = await checkedText(args.text, deps);
    const saved = await deps.saveDoc(env, name, text);
    const facts = describe(saved.text, deps);
    return toolResult(
      { url, name, title: facts.title, kind: facts.kind, summary: facts.summary, version: saved.version },
      `Updated “${facts.title || name}” (${facts.kind}: ${facts.summary}). Pages that have it open update by themselves.\n\n[Open the timeline](${url})\n\nNew version: ${saved.version}.`,
    );
  },

  async control_run(args, context) {
    const { env, deps } = context;
    const name = nameFrom(args.name, deps.reserved);
    const op = String(args.op || "").toLowerCase();
    if (!OPS.includes(op)) throw new ToolError(`op must be one of ${OPS.join(", ")}.`);
    const doc = await deps.loadDoc(env, name);
    if (!doc) throw new ToolError(`There is no timeline at “${name}”.`);
    const url = context.origin + name;
    if (TimelineText.clockOf(doc.text) !== "relative")
      throw new ToolError(`“${name}” is a day plan, which has no run. Only routines (steps from a Start button, like a workout or a recipe) can be started.`);
    if (!env.RUNS) throw new ToolError("Live runs are not available here.");
    const model = TimelineText.parse(doc.text);
    const steps = TimelineText.runConfig(model).steps;
    const stub = env.RUNS.get(env.RUNS.idFromName(name));
    const read = async (response) => {
      const body = await response.json();
      if (!response.ok) throw new ToolError(body.error || "The run did not answer.");
      return body;
    };
    let room = await read(await stub.fetch(new Request("https://run/state")));
    let note = "";
    if (op !== "status") {
      const before = where(room, steps);
      if (op === "start" && room.state && before.state !== "finished") note = "A run was already going, so it was left as it is (stop it first to start over).";
      else room = await read(await stub.fetch(new Request("https://run/op", { method: "POST", body: JSON.stringify({ op }), headers: { "content-type": "application/json" } })));
    }
    const at = where(room, steps);
    const core = TimelineText.runCore();
    const structured = {
      url,
      name,
      op,
      state: at.state,
      elapsed: core.clock(at.elapsed),
      elapsed_seconds: at.elapsed,
      total: core.total(core.end(steps)),
      current_step: at.current,
      next_step: at.next,
      ...(note ? { note } : {}),
    };
    const parts = [
      { idle: "Not running.", running: "Running.", paused: "Paused.", finished: "Finished." }[at.state],
      at.state === "idle" ? `It takes ${structured.total}.` : `${structured.elapsed} of ${structured.total}.`,
      at.current ? `Now: ${at.current.title}${at.current.left ? ` (${at.current.left} left)` : ""}.` : "",
      at.next ? (at.state === "idle" ? `First step: ${at.next.title}.` : `Next: ${at.next.title} in ${at.next.starts_in}.`) : "",
      note,
    ].filter(Boolean);
    return toolResult(structured, `${parts.join(" ")}\n\nEvery page with [the timeline](${url}) open follows the run.`);
  },
};

// Where a run is, in words and seconds, from the room's { state, now }.
function where(room, steps) {
  const core = TimelineText.runCore();
  const state = room && room.state;
  if (!state) {
    const first = steps[0];
    return { state: "idle", elapsed: 0, current: null, next: first ? { title: first.title, starts_in: "0:00" } : null };
  }
  const elapsed = Math.max(0, Math.floor(core.elapsedMs(state, room.now) / 1000));
  const end = core.end(steps);
  if (elapsed >= end) return { state: "finished", elapsed: end, current: null, next: null };
  const position = core.position(steps, elapsed);
  const step = position.ending || position.current;
  return {
    state: state.pausedAt == null ? "running" : "paused",
    elapsed,
    current: step ? { title: step.title, ...(step.detail ? { detail: step.detail } : {}), left: step.until !== undefined ? core.clock(step.until - elapsed) : null } : null,
    next: position.next ? { title: position.next.title, starts_in: core.clock(position.next.at - elapsed) } : null,
  };
}

// The text as the tools accept it, or a ToolError saying why not.
async function checkedText(value, deps) {
  if (typeof value !== "string" || !value.trim()) throw new ToolError("text is required: the complete timeline in the plain-text format (call format_guide for it).");
  const text = value.replace(/\r\n?/g, "\n");
  if (new TextEncoder().encode(text).length > MAX_TEXT) throw new ToolError("The text is over 100 KB. Shorten it (a timeline is usually a few KB).");
  const lines = text.split("\n");
  const embedded = lines.findIndex((line) => DATA_URI.test(line));
  if (embedded >= 0)
    throw new ToolError(
      `Line ${embedded + 1}: data: URIs are not accepted here. Use an https:// image URL you know exists, or leave the picture out; the person can add their own photos in the studio (tap a card, then Photo).`,
    );
  try {
    TimelineText.parse(text);
  } catch (error) {
    throw new ToolError(`${error.message}\n\nNothing was saved. Fix the text and call again (format_guide has the rules).`);
  }
  if ((await deps.encode(text)).length > MAX_PAYLOAD) throw new ToolError("The text is too large to save once compressed. Shorten it.");
  return text;
}

// A bare name, or a tl.gaup.uk link to one.
function nameFrom(value, reserved) {
  let raw = String(value ?? "").trim();
  if (!raw) throw new ToolError("name is required.");
  if (/^(https?:\/\/)?(www\.)?tl\.gaup\.uk(\/|$)/i.test(raw) || /^https?:\/\//i.test(raw)) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    } catch (error) {
      throw new ToolError(`“${raw}” is not a timeline link.`);
    }
    if (!HOSTS.has(url.hostname.toLowerCase())) throw new ToolError(`“${raw}” is not a Timeline Studio link (they start with https://tl.gaup.uk/).`);
    raw = decodeURIComponent(url.pathname);
  }
  const name = raw.replace(/^\/+|\/+$/g, "").replace(/\.txt$/, "").toLowerCase();
  if (!NAME.test(name)) throw new ToolError(`“${name}” is not a timeline name: use 3 to 32 lowercase letters, digits and dashes, starting and ending with a letter or digit.`);
  if (reserved.has(name)) throw new ToolError(`“${name}” is reserved. Pick another name.`);
  return name;
}

// The studio's own scheme (index.html newName): the title as a slug, then a
// random tail, so a made-up name is not guessable.
function madeUpName(title) {
  const slug =
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "timeline";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const tail = [...bytes].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `${slug}-${tail}`.replace(/-+/g, "-");
}

function describe(text, deps) {
  const model = TimelineText.parse(text);
  return { title: model.title || "", kind: TimelineText.clockOf(text) === "relative" ? "routine" : "day", summary: deps.summary(text) };
}

function originOf(request) {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin + "/";
  return "https://" + url.host + "/";
}

// ---- the format guide, from llms.txt ---------------------------------------

// llms.txt is the one description of the format (the studio serves it for
// chats without the connector). The guide is its sections for the kind,
// without the intro and "What to send back" (building a #text= link, which
// the tools replace).
let llmsCache = "";
async function llmsText(env, request) {
  if (llmsCache) return llmsCache;
  if (!env.ASSETS) throw new ToolError("The format guide is not available here.");
  const response = await env.ASSETS.fetch(new Request(new URL("/llms.txt", request.url)));
  if (!response.ok) throw new ToolError("The format guide is not available right now.");
  llmsCache = await response.text();
  return llmsCache;
}

const SKIPPED = new Set(["What to send back"]);
const FOR_KIND = {
  day: { skip: ["Several days", "Routines: workouts and recipes"] },
  trip: { skip: ["Routines: workouts and recipes"] },
  workout: { skip: ["Several days", "Places and links"] },
  recipe: { skip: ["Several days", "Places and links"] },
};

// llms.txt split at its ## and ### headings: [{ level, title, body }], the
// part before the first ## heading (the intro) as level 1.
export function sections(source) {
  const out = [{ level: 1, title: "", lines: [] }];
  for (const line of String(source).split("\n")) {
    const heading = line.match(/^(##|###) (.+?)\s*$/);
    if (heading) out.push({ level: heading[1].length, title: heading[2], lines: [line] });
    else out[out.length - 1].lines.push(line);
  }
  return out.map((s) => ({ level: s.level, title: s.title, body: s.lines.join("\n").trim() }));
}

export function formatGuide(source, kind = "") {
  const skip = new Set([...SKIPPED, ...((FOR_KIND[kind] && FOR_KIND[kind].skip) || [])]);
  const parts = [];
  let parentSkipped = false;
  for (const section of sections(source)) {
    if (section.level === 1) continue;
    // Pictures sits under Routines in llms.txt but covers every kind.
    if (section.level === 2) parentSkipped = skip.has(section.title);
    const skipped = section.level === 2 ? parentSkipped : skip.has(section.title) || (parentSkipped && section.title !== "Pictures");
    if (!skipped) parts.push(section.body);
  }
  const label = { day: "a day plan", trip: "a trip over several days", workout: "a workout (a routine)", recipe: "a recipe (a routine)" }[kind];
  return (
    `# Timeline Studio format${label ? `: ${label}` : ""}\n\n` +
    "From https://tl.gaup.uk/llms.txt. Write the timeline text by these rules, then save it with create_timeline (or update_timeline for one that exists) and give the person the link it returns.\n\n" +
    parts.join("\n\n") +
    "\n"
  );
}
