// Pictures, stored once by content in KV (img:<hash>) and served from
// /img/<hash>.<ext>. One path for every way a picture arrives: the studio's
// POST /img (raw bytes), an agent's POST /img with JSON ({ data } or
// { url }), and the MCP tool upload_image (mcp.js).
//
// Step photos and covers are stored once, by content, instead of riding in
// the text as base64: a routine with ten photos would otherwise make every
// save, poll and command carry megabytes. The studio downscales first
// (<= 1280 px, WebP or JPEG, ~400 KB); the server has no image codec, so it
// only refuses anything over 1.5 MB or that is not a PNG, JPEG, WebP or GIF
// by its own bytes (never SVG, which could carry script on this origin).
//
// Every costly step takes a `take(kind, amount)` hook when one is given
// (the daily budget, docs/limits.md): "fetch" before a URL is fetched,
// "img_count" and "img_bytes" before a new picture is written. A picture
// already stored costs nothing. The hook throws to refuse.

export const MAX_IMAGE = 1.5 * 1024 * 1024;
// A JSON body carrying one picture as base64 (4/3 of the bytes) plus room
// for the rest of the object.
export const MAX_IMAGE_JSON = Math.ceil((MAX_IMAGE * 4) / 3) + 64 * 1024;
export const IMAGE_PATH = /^\/img\/([0-9a-f]{16})\.(?:png|jpg|webp|gif)$/;
export const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const FETCH_TIMEOUT = 10_000;
const MAX_REDIRECTS = 3;
const TOO_LARGE = "Image too large (1.5 MB at most). Send at most about 1280 px on the long edge, as JPEG or WebP.";
const NOT_AN_IMAGE = "Only PNG, JPEG, WebP or GIF images";

// A refusal with the HTTP status POST /img answers; MCP turns the message
// into a tool error.
export class ImageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sniffImage(bytes) {
  const at = (i, ...values) => values.every((v, k) => bytes[i + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  return "";
}

// Raw base64 (standard or URL-safe, line breaks allowed) or a whole
// "data:image/...;base64,..." URI -> bytes. The label is only a hint: the
// bytes decide the type when the picture is stored.
export function bytesFromBase64(value) {
  let text = String(value ?? "").trim();
  if (!text) throw new ImageError(400, "No image data");
  const uri = text.match(/^data:([^;,]*)((?:;[^;,]*)*),/i);
  if (uri) {
    if (!/;base64/i.test(uri[2])) throw new ImageError(400, "A data: URI must be base64 (data:image/jpeg;base64,…)");
    text = text.slice(uri[0].length);
  }
  text = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 === 1) throw new ImageError(400, "The image data is not valid base64");
  // Decoded size, before decoding it.
  if (Math.floor((text.length * 3) / 4) - (text.match(/=*$/)[0].length) > MAX_IMAGE) throw new ImageError(413, TOO_LARGE);
  let binary;
  try {
    binary = atob(text.padEnd(Math.ceil(text.length / 4) * 4, "="));
  } catch (error) {
    throw new ImageError(400, "The image data is not valid base64");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// An https image fetched by the server: at most 3 redirects (each https),
// 10 s in all, an image content-type, and reading stops past 1.5 MB.
export async function fetchImage(value, { fetch: fetcher = fetch, take } = {}) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch (error) {
    throw new ImageError(400, "url must be an https:// image URL");
  }
  if (url.protocol !== "https:") throw new ImageError(400, "url must be an https:// image URL");
  if (take) await take("fetch", 1);
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    let response;
    for (let hop = 0; ; hop++) {
      response = await fetcher(url.href, { redirect: "manual", signal: controller.signal, headers: { accept: "image/webp,image/jpeg,image/png,image/gif;q=0.9,*/*;q=0.1" } });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      if (hop >= MAX_REDIRECTS) throw new ImageError(400, "The image URL redirects too many times (3 at most)");
      url = new URL(location, url);
      if (url.protocol !== "https:") throw new ImageError(400, "The image URL redirects away from https");
    }
    if (!response.ok) throw new ImageError(400, `Fetching the image failed (${response.status})`);
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/") || type === "image/svg+xml") throw new ImageError(415, `The URL is not an image (${type || "no content type"}). ${NOT_AN_IMAGE}.`);
    if (Number(response.headers.get("content-length")) > MAX_IMAGE) throw new ImageError(413, TOO_LARGE);
    return await readCapped(response.body);
  } catch (error) {
    if (error instanceof ImageError) throw error;
    if (controller.signal.aborted) throw new ImageError(408, "Fetching the image took too long (10 s at most)");
    throw new ImageError(400, `Fetching the image failed: ${error.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

// A body read to the end, or refused as soon as it passes the cap.
async function readCapped(body) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader(),
    parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE) {
      // Not awaited: a cancel can wait on the other side of a teed body.
      reader.cancel().catch(() => {});
      throw new ImageError(413, TOO_LARGE);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

// Check the bytes and store them under their hash (the same picture twice
// is stored once, and costs nothing the second time) -> { url, type, size,
// hash, fresh }. `origin` is the site the URL is made on.
export async function storeImage(env, bytes, origin, { take } = {}) {
  if (!bytes || !bytes.length) throw new ImageError(400, "No image");
  if (bytes.length > MAX_IMAGE) throw new ImageError(413, TOO_LARGE);
  const type = sniffImage(bytes);
  if (!type) throw new ImageError(415, NOT_AN_IMAGE);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = "img:" + hash;
  const existing = await env.LINKS.get(key, "stream");
  if (existing) await existing.cancel();
  else {
    if (take) {
      await take("img_count", 1);
      await take("img_bytes", bytes.length);
    }
    await env.LINKS.put(key, bytes, { metadata: { type, size: bytes.length } });
  }
  const link = new URL(`/img/${hash}.${IMAGE_TYPES[type]}`, origin);
  if (link.hostname !== "localhost" && link.hostname !== "127.0.0.1") link.protocol = "https:";
  return { url: link.href, type, size: bytes.length, hash, fresh: !existing };
}

// The picture an agent sent, as bytes: exactly one of base64 data or a URL.
// A URL of a picture already stored here is not fetched again.
export async function imageSource({ data, url, hosts, env, take, fetch: fetcher }) {
  const hasData = data !== undefined && data !== null && String(data).trim() !== "",
    hasUrl = url !== undefined && url !== null && String(url).trim() !== "";
  if (hasData === hasUrl) throw new ImageError(400, "Send exactly one of data (base64 or a data: URI) or url (https)");
  if (hasData) return bytesFromBase64(data);
  const own = ownImage(String(url), hosts);
  if (own) {
    const value = await env.LINKS.get("img:" + own, "arrayBuffer");
    if (value) return new Uint8Array(value);
  }
  return fetchImage(url, { fetch: fetcher, take });
}

function ownImage(value, hosts) {
  try {
    const url = new URL(value.trim());
    const match = url.pathname.match(IMAGE_PATH);
    return match && hosts && hosts.has(url.hostname) ? match[1] : "";
  } catch (error) {
    return "";
  }
}
