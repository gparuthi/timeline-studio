// Relative clock ("clock: relative"), step notes and the run arithmetic.
// Run: node --test tests/*.test.js   (or node tests/relative.test.js)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, render, runCore, runConfig } = require("../timeline-renderer.js");

const routine = (body, head = "") => `title: T\nclock: relative\n${head}\n${body}`;
const times = (model) => model.events.map((e) => [e.title, e.at, e.until]);

test("M:SS and H:MM:SS offsets are seconds from Start", () => {
  const m = parse(routine("0:00 | A\n5:30 | B\n1:02:03 | C\n90:00 | D"));
  assert.deepEqual(times(m), [
    ["A", 0, undefined],
    ["B", 330, undefined],
    ["C", 3723, undefined],
    ["D", 5400, undefined],
  ]);
  assert.equal(m.clock, "relative");
  assert.equal(m.total, 5400);
});

test("durations take s, m, h and combinations", () => {
  const cases = {
    "+45s": 45,
    "+2m": 120,
    "+1m30s": 90,
    "+1m30": 90,
    "+90s": 90,
    "+1h": 3600,
    "+1h30": 5400,
    "+90m": 5400,
    "+1.5h": 5400,
    "+2 min": 120,
    "+30 seconds": 30,
    "+1h 5m 10s": 3910,
  };
  for (const [clock, seconds] of Object.entries(cases)) {
    const m = parse(routine(`${clock} | A`));
    assert.equal(m.events[0].until - m.events[0].at, seconds, clock);
  }
  assert.throws(() => parse(routine("+ | A")), /elapsed time like 5:30/);
  for (const bad of ["+30", "+s", "+30s2m", "+2m1h", "+1m1m", "+0s", "+2 fortnights"])
    assert.throws(() => parse(routine(`${bad} | A`)), /duration like \+45s/, bad);
});

test("a +duration step starts where the line before it (in source order) ends", () => {
  const m = parse(routine("+30s | A\n+45s | B\n5:00 | Point\n+1m | C\n2:00 - 3:00 | Span\n+15s | D\n0:10 +20s | E\n+5s | F"));
  assert.deepEqual(times(m), [
    ["A", 0, 30],
    ["E", 10, 30],
    ["B", 30, 75],
    ["F", 30, 35],
    ["Span", 120, 180],
    ["D", 180, 195],
    ["Point", 300, undefined],
    ["C", 300, 360],
  ]);
});

test("the first +duration step starts at 0:00", () => {
  assert.deepEqual(times(parse(routine("+45s | A"))), [["A", 0, 45]]);
});

test("spans and parallel steps keep their times and sort by start", () => {
  const m = parse(routine("0:00 - 15:00 | Preheat\n0:00 +10m | Chop\n+5m | Season\n15:00 +25m | Roast"));
  assert.deepEqual(times(m), [
    ["Preheat", 0, 900],
    ["Chop", 0, 600],
    ["Season", 600, 900],
    ["Roast", 900, 2400],
  ]);
  assert.throws(() => parse(routine("5:00 - 4:00 | A")), /end time must be after/);
  assert.throws(() => parse(routine("5:60 | A")), /invalid elapsed time/);
});

test("day: is a section label on one continuous clock", () => {
  const m = parse(routine("day: Warm-up\n+1m | Jog\nday: Main set\nrange: 08:00 - 09:00\n+45s | Plank\n+15s | Rest"));
  assert.deepEqual(
    m.days.map((d) => [d.label, d.startSec, d.endSec, d.iso]),
    [
      ["Warm-up", 0, 60, ""],
      ["Main set", 60, 120, ""],
    ],
  );
  assert.deepEqual(times(m), [
    ["Jog", 0, 60],
    ["Plank", 60, 105],
    ["Rest", 105, 120],
  ]);
});

test("date, timezone, city and range are ignored on a relative clock", () => {
  const m = parse(routine("+45s | A", "date: Jun 6, 2026\ntimezone: Mars/Olympus\ncity: Nowhere\nrange: 1 - 2"));
  assert.equal(m.city, "");
  assert.equal(m.timezone, "");
  assert.equal(m.days[0].iso, "");
  assert.equal(m.days[0].range, null);
});

test("the clock is written, or inferred from a first +duration line; day timelines are unchanged", () => {
  // No clock line and a bare "+duration" first: a routine (this was an error before).
  const inferred = parse("title: T\n# steps\nday: Warm-up\n+30s | Jog\n0:30 +45s | Plank");
  assert.equal(inferred.clock, "relative");
  assert.deepEqual(times(inferred), [
    ["Jog", 0, 30],
    ["Plank", 30, 75],
  ]);
  // "clock: day" forces a day plan, so the same text is an error again.
  assert.throws(() => parse("title: T\nclock: day\n+45s | A"), /expected “time \| title”/);
  // Times that could be either clock never infer anything.
  assert.equal(parse("title: T\n0:30 | A").clock, "day");
  assert.throws(() => parse("title: T\n0:30 | A\n+45s | B"), /expected “time \| title”/);
  assert.throws(() => parse("title: T\nclock: sideways\n08:00 | A"), /clock: relative/);
  // A clock time in a routine says what to write instead.
  assert.throws(() => parse("title: T\n+15m | Preheat\n5:00 PM | Serve"), /a routine uses lengths, not clock times/);
  assert.throws(() => parse(routine("8:00 AM | A")), /a routine uses lengths, not clock times/);
  const day = parse("title: T\nclock: day\n08:00 | A\n09:30 +1h30 | B");
  assert.equal(day.clock, "day");
  assert.deepEqual(
    day.events.map((e) => [e.minutes, e.end]),
    [
      [480, undefined],
      [570, 660],
    ],
  );
  assert.equal(day.events[0].at, undefined);
  assert.equal(parse("title: T\n08:00 | A").clock, "day");
});

test("step notes belong to the event line right above them, in both clocks", () => {
  const m = parse(routine("+45s | Plank\n- Hips level\n- Breathe out\n+15s | Rest\n-\n"));
  assert.deepEqual(m.events[0].notes, ["Hips level", "Breathe out"]);
  assert.deepEqual(m.events[1].notes, []);
  const day = parse("title: T\n08:00 | Run\n- Easy pace\n09:00 | Swim");
  assert.deepEqual(day.events[0].notes, ["Easy pace"]);
  assert.deepEqual(day.events[1].notes, []);
  for (const stray of ["title: T\n- Oops\n08:00 | A", "title: T\n08:00 | A\n\n- Oops", "title: T\n08:00 | A\n# c\n- Oops", "title: T\n08:00 | A\nnote: x\n- Oops"])
    assert.throws(() => parse(stray), /step notes go right under a step/, stray);
});

test("a routine's page: the ready card and the elapsed lanes, no clock times", () => {
  const page = render("title: T\n+30s | Warm-up\n+45s | Plank\n- Hips level\n+15s | Rest\n1:30 | Flip\n+1m30s | Side\n\nnote: Mat, water");
  assert.match(page, /<main class="sheet routine"><header class="ready"><div class="ready-card"><h1>T<\/h1><p class="ready-kv"><b>3 min<\/b> <span>4 moves · 1 rest<\/span><\/p>/);
  assert.match(page, /data-chip="Mat">.*Mat<\/button><button type="button" class="chip" aria-pressed="false" data-chip="water">.*Water<\/button>/);
  assert.match(page, /<button type="button" class="ready-go"[^>]*>.*Start <small>· 3 min<\/small><\/button>/);
  // Edit beside Start, hidden until a page with an editor shows it (so the
  // floating Edit button never has to sit on a step).
  assert.match(page, /<\/button><button type="button" class="ready-edit" data-html2canvas-ignore hidden>✎ Edit<\/button><\/div>/);
  // Durations on chips, starts in the gutter, a rest as a slim row.
  assert.match(page, /<span class="dur">30s<\/span>.*<span class="dur">45s<\/span>.*<span class="dur">1½ min<\/span>/s);
  assert.match(page, /<span class="gl ly" data-t="0"[^>]*><b>start<\/b><\/span>/);
  assert.match(page, /<span class="gl ly" data-t="30"[^>]*>at ½ min<\/span>/);
  assert.match(page, /<div class="rs w ly" data-k="rest"[^>]*>.*<span class="rs-t">Rest<\/span><span class="rs-len">15s<\/span>/);
  assert.doesNotMatch(page, /data-t="75"/, "rests get no gutter label");
  // A moment in no step is a row of its own; notes fold under the card.
  assert.match(page, /<div class="mo w ly" data-k="moment"[^>]*>.*<b>Flip<\/b>/);
  assert.match(page, /<summary>1 note<\/summary><ul><li>Hips level<\/li><\/ul>/);
  assert.match(page, /Done · about 3 min<\/div><\/section>/);
  assert.doesNotMatch(page, /AM|PM|class="hour|class="masthead/);
});

test("run arithmetic: elapsed is computed from the state, never accumulated", () => {
  const core = runCore();
  let s = core.apply(null, { op: "start" }, 1000);
  assert.equal(core.elapsedMs(s, 6000), 5000);
  s = core.apply(s, { op: "pause" }, 6000);
  assert.equal(core.elapsedMs(s, 60000), 5000, "paused holds");
  s = core.apply(s, { op: "resume" }, 16000);
  assert.equal(s.pausedMs, 10000);
  assert.equal(core.elapsedMs(s, 17000), 6000);
  assert.equal(core.apply(s, { op: "pause" }, 17000).pausedAt, 17000);
  assert.equal(core.apply(s, { op: "stop" }, 17000), null);
  assert.equal(core.apply(null, { op: "pause" }, 1), null);
});

test("run arithmetic: skip, back (3 s rule) and seek change only shiftMs", () => {
  const core = runCore(),
    { steps } = runConfig(parse(routine("+30s | A\n+45s | B\n+15s | C")));
  assert.equal(core.skipTo(steps, 10), 30);
  assert.equal(core.skipTo(steps, 80), 90, "past the last start: the end");
  assert.equal(core.backTo(steps, 40), 30, "into B: back to B's start");
  assert.equal(core.backTo(steps, 32), 0, "within 3 s of B's start: A's start");
  assert.equal(core.backTo(steps, 1), 0);
  let s = core.apply(null, { op: "start" }, 0);
  const seek = core.seek(s, 10000, core.skipTo(steps, 10));
  assert.deepEqual(seek, { op: "seek", shiftMs: 20000 });
  s = core.apply(s, seek, 10000);
  assert.equal(core.elapsedMs(s, 10000), 30000);
  assert.equal(s.startedAt, 0);
  assert.equal(s.pausedMs, 0);
});

test("run position: active steps, most recent first; countdown follows the one ending soonest", () => {
  const core = runCore(),
    { steps } = runConfig(parse(routine("0:00 - 15:00 | Preheat\n0:00 +10m | Chop\n+5m | Season\n15:00 +25m | Roast")));
  let p = core.position(steps, 300);
  assert.deepEqual(
    p.active.map((s) => s.title),
    ["Chop", "Preheat"],
  );
  assert.equal(p.ending.title, "Chop");
  assert.equal(p.next.title, "Season");
  p = core.position(steps, 700);
  assert.deepEqual(
    p.active.map((s) => s.title),
    ["Season", "Preheat"],
  );
  assert.equal(p.ending.until, 900);
  assert.equal(core.position(steps, 2400).done, true);
  assert.equal(core.position(steps, 2399).done, false);
});

test("run labels", () => {
  const core = runCore();
  assert.deepEqual([45, 120, 90, 3600, 5400].map(core.length), ["45s", "2m", "1:30", "1h", "1h 30m"]);
  assert.deepEqual([45, 330, 3723].map(core.clock), ["0:45", "5:30", "1:02:03"]);
  assert.deepEqual([45, 1200, 1230, 3900].map(core.total), ["45 sec", "20 min", "20 min 30 sec", "1 h 5 min"]);
  assert.equal(core.spoken(90), "1 minute 30 seconds");
});

test("the run key follows the steps, not formatting", () => {
  const a = runConfig(parse(routine("+30s | A\n+45s | B"))).key,
    b = runConfig(parse(routine("+30s  |  A\n\n+45s | B | a description"))).key,
    c = runConfig(parse(routine("+30s | A\n+50s | B"))).key;
  assert.equal(a, b);
  assert.notEqual(a, c);
});
