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

test("relative mode must be written; day timelines are unchanged", () => {
  assert.throws(() => parse("title: T\n+45s | A"), /expected “time \| title”/);
  assert.throws(() => parse("title: T\nclock: sideways\n08:00 | A"), /clock: relative/);
  assert.throws(() => parse(routine("8:00 AM | A")), /relative clock a step starts/);
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

test("a relative sheet: badges, offsets, ticks and the masthead", () => {
  const page = render(routine("+30s | Warm-up\n+45s | Plank\n- Hips level\n+15s | Rest\n1:30 | Flip\n+1m30s | Side"));
  assert.match(page, /<p class="date">3 min · 5 steps<\/p>/);
  assert.match(page, /<time>30s<\/time>.*<time>45s<\/time>.*<time>15s<\/time>.*<time>1:30<\/time>.*<time>1:30<\/time>/s);
  assert.match(page, /class="timeline relative" data-clock="relative"/);
  assert.match(page, /<span class="offset" data-minute="0.5" style="--m:0.5">0:30<\/span>/);
  assert.match(page, /<span class="hour-label">1:00<\/span>/);
  assert.match(page, /<span class="hour-label">3:00<\/span>/);
  assert.match(page, /<summary>1 note<\/summary><ul><li>Hips level<\/li><\/ul>/);
  assert.doesNotMatch(page, /AM|PM/);
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
