// A small CalDAV server over a named timeline, so a calendar app can edit
// the events and the text follows. iOS/macOS Calendar, Thunderbird and
// DAVx5 (Android) can add it as an account; Google Calendar cannot use
// outside CalDAV servers and keeps the read-only .ics feed.
//
//   account URL   https://tl.gaup.uk/dav/<name>/     (or just the host:
//                 /.well-known/caldav redirects here)
//   user          <name>          password  anything (the name is the key)
//   calendar      /dav/<name>/cal/
//   events        /dav/<name>/cal/<uid>.ics
//
// An event's uid is built from its title (plus a counter for repeated
// titles), not its time, so a dragged event keeps its identity. A PUT
// rewrites that line's time (and day, title, and a span when the length
// changed), a PUT to a new uid adds a line, DELETE removes one. Fields the
// calendar does not know (icon, colour, the rest of the description) are
// kept as written. Every change stores a new content version and points
// the name at it, exactly like a publish from the studio.
//
// Only what those clients need is implemented: OPTIONS, PROPFIND (depth 0
// and 1, a fixed set of properties), REPORT calendar-query and
// calendar-multiget, GET, PUT, DELETE. No sync-collection: clients fall
// back to ctag + etags, and a timeline is a few dozen events.

import TimelineText from "../../timeline-renderer.js";

const DAV = /^\/dav\/(?:([a-z0-9][a-z0-9-]{1,30}[a-z0-9])\/(?:cal\/(?:([A-Za-z0-9_-]+)\.ics)?)?)?$/;
const DEFAULT_ZONE = "America/Los_Angeles";
const DEFAULT_MINUTES = 60;
const NS =
  'xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:A="http://apple.com/ns/ical/"';

export function isDavRequest(url, method) {
  return (
    url.pathname === "/dav" ||
    url.pathname.startsWith("/dav/") ||
    url.pathname === "/.well-known/caldav" ||
    method === "PROPFIND" ||
    method === "REPORT" ||
    (method === "OPTIONS" && url.pathname === "/")
  );
}

export async function handleDav(request, env, deps) {
  const url = new URL(request.url),
    method = request.method;
  if (url.pathname === "/.well-known/caldav") return redirect("/dav/", url);
  if (method === "OPTIONS") return davOptions();
  if (url.pathname === "/" && method === "PROPFIND") return redirect("/dav/", url);
  const match = url.pathname.match(DAV);
  if (!match) return new Response("Not found", { status: 404 });
  // Everything under /dav needs the name; the password can be anything
  // (calendar apps insist on one). A name is the whole capability here,
  // as it is for the link itself.
  const auth = basicAuth(request);
  if (!auth) return unauthorized();
  const name = auth.user,
    [, pathName, uid] = match,
    principal = `/dav/${name}/`,
    calendarHref = `/dav/${name}/cal/`;
  if (pathName && pathName !== name) return new Response("Forbidden", { status: 403 });
  const doc = await deps.loadDoc(env, name);
  if (!doc) return unauthorized();
  // Calendar apps keep the href they created an event under; those are
  // remembered ("dav:<name>" -> { href id: title id }) so a later PUT or a
  // rename from either side still finds the line.
  const hrefMap = (await env.LINKS.get("dav:" + name, "json")) || {};
  const text = doc.text,
    model = TimelineText.parse(text),
    events = eventObjects(model, name, calendarHref, hrefMap),
    ctag = doc.version,
    etag = `"${doc.version}"`;
  const depth = request.headers.get("depth") === "1" ? 1 : 0;
  const level = !pathName ? "root" : uid ? "event" : url.pathname.endsWith("/cal/") ? "calendar" : "principal";

  if (method === "PROPFIND") {
    const responses = [];
    if (level === "root") responses.push(response("/dav/", rootProps(principal)));
    if (level === "principal") {
      responses.push(response(principal, principalProps(name, principal)));
      if (depth) responses.push(response(calendarHref, calendarProps(model, name, calendarHref, ctag)));
    }
    if (level === "calendar") {
      responses.push(response(calendarHref, calendarProps(model, name, calendarHref, ctag)));
      if (depth) events.forEach((e) => responses.push(response(e.href, eventProps(etag))));
    }
    if (level === "event") {
      const event = events.find((e) => e.uid === uid);
      if (!event) return new Response("Not found", { status: 404 });
      responses.push(response(event.href, eventProps(etag)));
    }
    return multistatus(responses);
  }
  if (method === "REPORT" && level === "calendar") {
    const body = await request.text();
    let chosen = events;
    if (/calendar-multiget/i.test(body)) {
      const hrefs = [...body.matchAll(/<(?:[A-Za-z0-9]+:)?href[^>]*>([^<]+)<\//g)].map((m) => decodeURIComponent(m[1].trim()));
      chosen = events.filter((e) => hrefs.includes(e.href));
      const missing = hrefs.filter((h) => !events.some((e) => e.href === h));
      return multistatus([
        ...chosen.map((e) => response(e.href, eventProps(etag) + `<C:calendar-data>${escapeXml(e.ics)}</C:calendar-data>`)),
        ...missing.map((h) => `<D:response><D:href>${escapeXml(h)}</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>`),
      ]);
    }
    return multistatus(chosen.map((e) => response(e.href, eventProps(etag) + `<C:calendar-data>${escapeXml(e.ics)}</C:calendar-data>`)));
  }
  if (level === "event" && (method === "GET" || method === "HEAD")) {
    const event = events.find((e) => e.uid === uid);
    if (!event) return new Response("Not found", { status: 404 });
    return new Response(method === "HEAD" ? null : event.ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", etag, "cache-control": "no-store" },
    });
  }
  if (level === "event" && method === "PUT") {
    const incoming = parseEvent(await request.text());
    if (!incoming) return new Response("Expected one VEVENT", { status: 400 });
    const existing = events.find((e) => e.uid === uid);
    if (!existing && request.headers.get("if-match")) return new Response("No such event", { status: 412 });
    const nextText = applyEvent(text, model, existing, incoming);
    if (nextText === text) return new Response(null, { status: 204, headers: { etag } });
    const saved = await deps.saveDoc(env, name, nextText);
    // Keep the href the client used pointing at the line it edited: find
    // the event by its (possibly new) title in the saved text.
    const after = eventObjects(TimelineText.parse(saved.text), name, calendarHref, {});
    const wanted = (incoming.summary || (existing && existing.event.title) || "").trim();
    const target =
      after.find((e) => e.event.title === wanted && (!existing || e.day.iso === toWallIso(incoming, existing, model))) ||
      after.find((e) => e.event.title === wanted);
    if (target && target.ownUid !== uid && hrefMap[uid] !== target.ownUid) {
      hrefMap[uid] = target.ownUid;
      await env.LINKS.put("dav:" + name, JSON.stringify(hrefMap));
    }
    return new Response(null, { status: existing ? 204 : 201, headers: { etag: `"${saved.version}"` } });
  }
  if (level === "event" && method === "DELETE") {
    const existing = events.find((e) => e.uid === uid);
    if (!existing) return new Response("Not found", { status: 404 });
    const lines = text.split("\n");
    removeEvent(lines, existing);
    await deps.saveDoc(env, name, tidy(lines).join("\n"));
    if (hrefMap[uid]) {
      delete hrefMap[uid];
      await env.LINKS.put("dav:" + name, JSON.stringify(hrefMap));
    }
    return new Response(null, { status: 204 });
  }
  return new Response("Method not allowed", { status: 405, headers: { allow: "OPTIONS, PROPFIND, REPORT, GET, PUT, DELETE" } });
}

function toWallIso(incoming, existing, model) {
  const zone = (existing && existing.day.timezone) || model.timezone || DEFAULT_ZONE;
  return toWall(incoming.start, zone).iso;
}

// ---- the calendar's view of the timeline -------------------------------

export function eventObjects(model, name, calendarHref, hrefMap = {}) {
  const zone = model.timezone || DEFAULT_ZONE,
    seen = new Map(),
    byOwn = new Map(Object.entries(hrefMap).map(([href, own]) => [own, href])),
    out = [];
  for (const day of model.days) {
    if (!day.iso) continue;
    const dayZone = day.timezone || zone;
    for (const event of day.events) {
      const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event",
        n = seen.get(slug) || 0;
      seen.set(slug, n + 1);
      const ownUid = `${name}-${slug}${n ? "-" + n : ""}`,
        uid = byOwn.get(ownUid) || ownUid,
        end = event.end || event.minutes + DEFAULT_MINUTES,
        { place, url } = TimelineText.location(event, day, model);
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Timeline Studio//tl.gaup.uk//EN",
        "BEGIN:VEVENT",
        `UID:${uid}@tl.gaup.uk`,
        `DTSTAMP:${stamp(Date.now())}`,
        `DTSTART:${stamp(wallToUtc(day.iso, event.minutes, dayZone))}`,
        `DTEND:${stamp(wallToUtc(day.iso, end, dayZone))}`,
        `SUMMARY:${esc(event.title)}`,
      ];
      if (event.detail) lines.push(`DESCRIPTION:${esc(event.detail)}`);
      if (place) lines.push(`LOCATION:${esc(place)}`);
      if (url) lines.push(`URL:${url}`);
      lines.push(`X-TIMELINE-LINE:${event.line}`, "END:VEVENT", "END:VCALENDAR");
      out.push({ uid, ownUid, href: `${calendarHref}${uid}.ics`, line: event.line, day, event, ics: fold(lines) });
    }
  }
  return out;
}

// ---- writing a calendar edit back into the text -------------------------

export function applyEvent(text, model, existing, incoming) {
  const zone = model.timezone || DEFAULT_ZONE;
  const lines = text.split("\n");
  // Where the event now is, in the timeline's own zone.
  const start = toWall(incoming.start, existing ? existing.day.timezone || zone : zone),
    endWall = incoming.end ? toWall(incoming.end, existing ? existing.day.timezone || zone : zone) : null;
  let minutes = start.minutes,
    endMinutes = endWall ? (endWall.iso === start.iso ? endWall.minutes : 1439) : minutes + DEFAULT_MINUTES;
  if (endMinutes <= minutes) endMinutes = minutes + DEFAULT_MINUTES;
  const wasSpan = existing && existing.event.end != null,
    span = wasSpan || endMinutes - minutes !== DEFAULT_MINUTES,
    time = span ? `${hhmm(minutes)} - ${hhmm(Math.min(endMinutes, 1439))}` : hhmm(minutes);
  let fields;
  if (existing) {
    fields = splitFields(lines[existing.line - 1]);
    if (incoming.summary && incoming.summary !== existing.event.title) fields[1] = incoming.summary;
  } else {
    // A new event's location becomes an "@ place" so the sheet shows the pin.
    fields = [null, incoming.summary || "Event", [incoming.description, incoming.location && `@ ${incoming.location}`].filter(Boolean).join(" ")];
  }
  fields[0] = time;
  while (fields.length > 2 && !fields.at(-1)) fields.pop();
  const line = fields.map((f, i) => (i === 0 ? f : String(f).replace(/\|/g, "\\|"))).join(" | ");
  if (existing && start.iso === existing.day.iso) {
    lines[existing.line - 1] = line;
    return lines.join("\n");
  }
  // Another day (or a new event): take the line out, drop it into the day.
  const cut = existing ? removeEvent(lines, existing) : null;
  const after = insertionPoint(lines, model, cut, start.iso, minutes);
  lines.splice(after, 0, ...(typeof after === "number" ? [line] : []));
  return tidy(lines).join("\n");
}

// Take an event's line out; when it was the day's last event, the day's
// own line goes too (a day: with nothing under it does not parse), along
// with a range: written just under it. Returns where the cut starts and
// how many lines it took, for the index shifts that follow.
function removeEvent(lines, removed) {
  lines.splice(removed.line - 1, 1);
  const day = removed.day;
  if (!day.line || day.events.length > 1 || day.notes.length) return { line: removed.line, count: 1 };
  let count = 1;
  while (day.line - 1 + count < lines.length && /^\s*range\s*:/.test(lines[day.line - 1 + count])) count++;
  lines.splice(day.line - 1, count);
  return { line: day.line, count: count + 1 };
}

// Index in `lines` before which the new line goes. Appends a `day:` block
// when the day is not on the sheet yet.
function insertionPoint(lines, model, removed, iso, minutes) {
  const shift = (n) => (removed && n > removed.line ? n - removed.count : n);
  const days = model.days.filter((d) => d.iso);
  const day = days.find((d) => d.iso === iso);
  if (day) {
    const events = day.events.filter((e) => !removed || e.line < removed.line || e.line >= removed.line + removed.count);
    const before = events.filter((e) => e.minutes <= minutes).at(-1);
    if (before) return shift(before.line); // after that event's line (1-based line == 0-based index + 1)
    const first = events[0];
    if (first) return shift(first.line) - 1;
    // No events: right after the day's own line (and a range: line under it).
    let at = day.line ? shift(day.line) : 0;
    while (at < lines.length && /^\s*(range|note)\s*:/.test(lines[at])) at++;
    return at;
  }
  // New day: keep days in date order, append a block.
  const later = days.find((d) => d.iso > iso);
  const heading = `day: ${label(iso)}`;
  if (later) {
    const at = shift(later.line) - 1;
    lines.splice(at, 0, "", heading);
    return at + 2;
  }
  lines.push("", heading);
  return lines.length;
}

function splitFields(line) {
  const out = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (line[i] === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += line[i];
  }
  out.push(cur.trim());
  return out;
}

function tidy(lines) {
  const out = [];
  for (const l of lines) if (!(l.trim() === "" && out.length && out.at(-1).trim() === "")) out.push(l);
  while (out.length && out.at(-1).trim() === "") out.pop();
  return out;
}

function label(iso) {
  const [y, m, d] = iso.split("-").map(Number),
    date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---- iCalendar in and out ----------------------------------------------

export function parseEvent(body) {
  const unfolded = body.replace(/\r?\n[ \t]/g, ""),
    block = unfolded.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/);
  if (!block) return null;
  const props = {};
  for (const raw of block[1].split(/\r?\n/)) {
    const m = raw.match(/^([A-Za-z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const params = Object.fromEntries(
      m[2]
        .split(";")
        .filter(Boolean)
        .map((p) => p.split("=").map((s) => s.replace(/^"|"$/g, ""))),
    );
    props[m[1].toUpperCase()] = { value: m[3], params };
  }
  if (!props.DTSTART) return null;
  const start = parseTime(props.DTSTART);
  let end = props.DTEND ? parseTime(props.DTEND) : null;
  if (!end && props.DURATION) {
    const d = props.DURATION.value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
    const mins = d ? (Number(d[1] || 0) * 24 * 60 + Number(d[2] || 0) * 60 + Number(d[3] || 0)) : 0;
    end = { ...start, minutes: start.minutes + mins };
  }
  const unesc = (s) => (s == null ? "" : s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim());
  return {
    start,
    end,
    summary: unesc(props.SUMMARY?.value),
    description: unesc(props.DESCRIPTION?.value).split("\n")[0],
    location: unesc(props.LOCATION?.value),
  };
}

// {y,m,d,minutes, zone: "utc" | "floating" | <TZID>}
function parseTime(prop) {
  const v = prop.value.trim(),
    m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!m) return null;
  const allDay = !m[4];
  return {
    y: +m[1],
    mo: +m[2],
    d: +m[3],
    minutes: allDay ? 9 * 60 : +m[4] * 60 + +m[5],
    zone: m[7] ? "utc" : prop.params.TZID || "floating",
    allDay,
  };
}

// A parsed time -> { iso, minutes } as wall-clock time in `zone`.
function toWall(t, zone) {
  const iso = `${t.y}-${String(t.mo).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  if (t.zone === "floating" || t.allDay || t.zone === zone) return { iso, minutes: t.minutes };
  let ms;
  if (t.zone === "utc") ms = Date.UTC(t.y, t.mo - 1, t.d, 0, t.minutes);
  else {
    try {
      ms = wallToUtc(iso, t.minutes, t.zone);
    } catch (error) {
      return { iso, minutes: t.minutes }; // unknown TZID: take it as written
    }
  }
  return utcToWall(ms, zone);
}

function offsetAt(ms, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms;
}

export function wallToUtc(iso, minutes, zone) {
  const [y, m, d] = iso.split("-").map(Number),
    wall = Date.UTC(y, m - 1, d, 0, minutes);
  let utc = wall - offsetAt(wall, zone);
  utc = wall - offsetAt(utc, zone);
  return utc;
}

function utcToWall(ms, zone) {
  const local = new Date(ms + offsetAt(ms, zone));
  return {
    iso: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function fold(lines) {
  const encoder = new TextEncoder();
  return (
    lines
      .map((line) => {
        const out = [];
        let chunk = "";
        for (const char of line) {
          if (encoder.encode(chunk + char).length > (out.length ? 74 : 75)) {
            out.push(chunk);
            chunk = "";
          }
          chunk += char;
        }
        out.push(chunk);
        return out.join("\r\n ");
      })
      .join("\r\n") + "\r\n"
  );
}

// ---- WebDAV plumbing ----------------------------------------------------

function basicAuth(request) {
  const header = request.headers.get("authorization") || "",
    m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  let decoded;
  try {
    decoded = atob(m[1]);
  } catch (error) {
    return null;
  }
  const at = decoded.indexOf(":");
  if (at < 0) return null;
  return { user: decoded.slice(0, at).trim().toLowerCase(), pass: decoded.slice(at + 1).trim() };
}

function unauthorized() {
  return new Response("Sign in with the link name and its edit id", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Timeline Studio"', dav: "1, 3, calendar-access" },
  });
}

function davOptions() {
  return new Response(null, {
    status: 200,
    headers: { dav: "1, 3, calendar-access", allow: "OPTIONS, PROPFIND, REPORT, GET, HEAD, PUT, DELETE" },
  });
}

function redirect(path, url) {
  return new Response(null, { status: 301, headers: { location: new URL(path, url).href } });
}

const escapeXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function response(href, props) {
  return `<D:response><D:href>${escapeXml(href)}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}

function multistatus(responses) {
  return new Response(`<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus ${NS}>${responses.join("")}</D:multistatus>`, {
    status: 207,
    headers: { "content-type": "application/xml; charset=utf-8", dav: "1, 3, calendar-access" },
  });
}

const privileges =
  "<D:current-user-privilege-set><D:privilege><D:read/></D:privilege><D:privilege><D:write/></D:privilege><D:privilege><D:write-content/></D:privilege><D:privilege><D:bind/></D:privilege><D:privilege><D:unbind/></D:privilege></D:current-user-privilege-set>";

function rootProps(principal) {
  return `<D:resourcetype><D:collection/></D:resourcetype><D:current-user-principal><D:href>${principal}</D:href></D:current-user-principal><D:displayname>Timeline Studio</D:displayname>`;
}

function principalProps(name, principal) {
  return (
    `<D:resourcetype><D:collection/><D:principal/></D:resourcetype>` +
    `<D:displayname>${escapeXml(name)}</D:displayname>` +
    `<D:current-user-principal><D:href>${principal}</D:href></D:current-user-principal>` +
    `<D:principal-URL><D:href>${principal}</D:href></D:principal-URL>` +
    `<C:calendar-home-set><D:href>${principal}</D:href></C:calendar-home-set>` +
    `<C:calendar-user-address-set><D:href>mailto:${escapeXml(name)}@tl.gaup.uk</D:href></C:calendar-user-address-set>` +
    privileges
  );
}

function calendarProps(model, name, href, ctag) {
  return (
    `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>` +
    `<D:displayname>${escapeXml(model.title || name)}</D:displayname>` +
    `<D:owner><D:href>/dav/${escapeXml(name)}/</D:href></D:owner>` +
    `<CS:getctag>${escapeXml(ctag)}</CS:getctag>` +
    `<C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>` +
    `<D:supported-report-set><D:supported-report><D:report><C:calendar-multiget/></D:report></D:supported-report><D:supported-report><D:report><C:calendar-query/></D:report></D:supported-report></D:supported-report-set>` +
    `<A:calendar-color>#165481FF</A:calendar-color>` +
    `<C:calendar-timezone>${escapeXml(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Timeline Studio//tl.gaup.uk//EN\r\nBEGIN:VTIMEZONE\r\nTZID:${model.timezone || DEFAULT_ZONE}\r\nEND:VTIMEZONE\r\nEND:VCALENDAR\r\n`)}</C:calendar-timezone>` +
    privileges
  );
}

function eventProps(etag) {
  return `<D:resourcetype/><D:getetag>${escapeXml(etag)}</D:getetag><D:getcontenttype>text/calendar; charset=utf-8; component=VEVENT</D:getcontenttype>`;
}
