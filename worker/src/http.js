// Request bodies read with a hard cap (docs/limits.md §3): the declared
// length is checked first, and a body without one (chunked) is read only
// until it passes the cap, never whole.

export class TooLarge extends Error {
  constructor(max) {
    super(`Request too large (${Math.round(max / 1024)} KB at most)`);
    this.status = 413;
  }
}

export async function readBytes(request, max) {
  if (Number(request.headers.get("content-length")) > max) throw new TooLarge(max);
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(),
    parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      reader.cancel().catch(() => {});
      throw new TooLarge(max);
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

export async function readText(request, max) {
  return new TextDecoder().decode(await readBytes(request, max));
}
