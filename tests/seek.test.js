// Seek (docs/routines.md §8): where a jump lands (clamped, relative, a
// step), one op per jump and none during a drag, Undo, Start at, what the
// cues say after a jump, and what the pages carry for it.
// Run: node --test tests/*.test.*
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, render, runCore, runConfig, runRuntime } = require("../timeline-renderer.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const core = runCore();
const recipe = runConfig(parse(read("example.recipe.txt"))).steps;
const workout = runConfig(parse(read("example.routine.txt"))).steps;
const elapsed = (state, now) => core.elapsedMs(state, now) / 1000;

test("seek targets: elapsed times, seconds and lengths, clamped to the routine", () => {
  const total = core.end(recipe);
  assert.equal(total, 2700);
  assert.equal(core.seekTarget("3:00", 1500, total), 180);
  assert.equal(core.seekTarget("0:45", 1500, total), 45);
  assert.equal(core.seekTarget("1:02:03", 0, 99999), 3723);
  assert.equal(core.seekTarget("180", 1500, total), 180);
  assert.equal(core.seekTarget(180, 1500, total), 180);
  assert.equal(core.seekTarget(180.4, 1500, total), 180, "whole seconds");
  assert.equal(core.seekTarget("3m", 1500, total), 180);
  assert.equal(core.seekTarget("1m30s", 1500, total), 90);
  assert.equal(core.seekTarget("2 min", 1500, total), 120);
  assert.equal(core.seekTarget(" 3:00 ", 1500, total), 180);
  // Clamped to [0, total].
  assert.equal(core.seekTarget("1:02:03", 0, total), total);
  assert.equal(core.seekTarget(99999, 0, total), total);
  assert.equal(core.seekTarget(-30, 100, total), 0, "a number is an elapsed time, not a move");
  assert.equal(core.seekTarget("0:00", 100, total), 0);
  for (const bad of ["abc", "5:75", "1:60:00", "", "3 parsecs", "1m30", "+", "--2m", null, Number.NaN])
    assert.throws(() => core.seekTarget(bad, 1500, total), /is not a time in the run/, String(bad));
});

test("seek targets: +30s / -2m move from where the run is, and stay in the routine", () => {
  const total = 2700;
  assert.equal(core.seekTarget("+30s", 1500, total), 1530);
  assert.equal(core.seekTarget("-2m", 1500, total), 1380);
  assert.equal(core.seekTarget("+1:30", 1500, total), 1590);
  assert.equal(core.seekTarget("+ 45", 1500, total), 1545, "seconds without a unit");
  assert.equal(core.seekTarget("-1m30s", 1500.6, total), 1411, "from a fractional second, rounded");
  assert.equal(core.seekTarget("-5m", 60, total), 0);
  assert.equal(core.seekTarget("+10m", 2600, total), total);
});

test("step targets: an exact title, then a line number, then a unique start of a title", () => {
  assert.equal(core.stepFor(recipe, "Roast").at, 900);
  assert.equal(core.stepFor(recipe, "roast").at, 900, "case-insensitive");
  assert.equal(core.stepFor(recipe, "Season").title, "Season the tray", "a unique start");
  assert.equal(core.stepFor(recipe, "11").title, "Season the tray", "a line number");
  assert.equal(core.stepFor(recipe, 12).title, "Roast", "a number is a line");
  assert.equal(core.stepFor(recipe, "Toss the vegetables").at, 1650, "a moment is a place too");
  assert.equal(core.stepFor(workout, "Side plank L").at, 120, "an exact title beats a shared start");
  assert.throws(() => core.stepFor(workout, "Side plank"), /matches more than one step \(Side plank L, Side plank R\)/);
  assert.throws(() => core.stepFor(workout, "Rest"), /More than one step is called “Rest”: give its line number/);
  assert.equal(core.stepFor(workout, "16").at, 165, "one of the rests, by its line");
  assert.throws(() => core.stepFor(recipe, "Dessert"), /No step is called “Dessert”\. Steps: Preheat the oven \(line 7\);/);
  assert.throws(() => core.stepFor(recipe, "3"), /Line 3 is not a step/);
  assert.throws(() => core.stepFor(recipe, " "), /Name a step/);
  // Digits that are a step's title are that step.
  const numbered = runConfig(parse("title: N\n+1m | 100\n+1m | Rest")).steps;
  assert.equal(core.stepFor(numbered, "100").title, "100");
});

test("one op per jump: a seek on the run's clock, landing exactly there; paused stays paused", () => {
  let state = core.apply(null, { op: "start" }, 0);
  const now = 25 * 60 * 1000; // 25:00 in
  const op = core.jumpOp(state, now, 180);
  assert.equal(op.op, "seek");
  state = core.apply(state, op, now);
  assert.equal(elapsed(state, now), 180);
  assert.equal(elapsed(state, now + 5000), 185, "running keeps running");
  // Paused: the jump moves it and it stays paused.
  state = core.apply(state, { op: "pause" }, now + 5000);
  const paused = core.apply(state, core.jumpOp(state, now + 9000, 600), now + 9000);
  assert.notEqual(paused.pausedAt, null);
  assert.equal(elapsed(paused, now + 9000), 600);
  assert.equal(elapsed(paused, now + 60000), 600, "still paused a minute later");
  // Before Start the one op is a start already in.
  assert.deepEqual(core.jumpOp(null, now, 180), { op: "start", shiftMs: 180000 });
});

test("a drag previews and sends nothing until it is let go, then one jump; a cancel sends none", () => {
  const total = core.end(workout),
    sent = [];
  let state = core.apply(null, { op: "start" }, 0);
  const send = (op) => {
    sent.push(op);
    state = core.apply(state, op, 400000);
  };
  const drag = core.scrub(0, total, { marks: core.ticks(workout), within: 3 });
  const previews = [];
  for (let k = 18; k >= 4; k--) previews.push(drag.move(k / 20));
  assert.equal(sent.length, 0, "no op while dragging");
  assert.equal(previews.length, 15);
  assert.equal(drag.value(), previews.at(-1));
  const t = drag.end();
  send(core.jumpOp(state, 400000, t));
  assert.equal(drag.end(), null, "a release is used once");
  assert.equal(sent.length, 1);
  assert.equal(elapsed(state, 400000), t);
  // Cancelled (the pointer was taken for a scroll): nothing to send.
  const cancelled = core.scrub(0, total);
  cancelled.move(0.5);
  cancelled.cancel();
  assert.equal(cancelled.end(), null);
  // A drag clamps to its bar and lands on a step's start when close.
  const step = core.scrub(60, 105);
  assert.equal(step.move(-0.4), 60);
  assert.equal(step.move(1.7), 105);
  const near = core.scrub(0, 600, { marks: [120, 180], within: 6 });
  assert.equal(near.move(124 / 600), 120);
  assert.equal(near.move(130 / 600), 130);
  // The runtime sends from jump() only: moves repaint, releases land.
  const source = runRuntime.toString(),
    body = (name) => source.slice(source.indexOf(`const ${name} = `), source.indexOf("\n    };", source.indexOf(`const ${name} = `)));
  for (const handler of ["onBarDown", "onBarMove", "onBarKey"]) assert.doesNotMatch(body(handler), /transport\.send|jump\(/, handler);
  assert.match(body("onBarUp"), /land\(s\.bar, s\.session\.end\(\)\)/);
  const jump = source.slice(source.indexOf("function jump(t)"), source.indexOf("function notice("));
  assert.equal(jump.match(/transport\.send\(/g).length, 2, "one send before Start, one during a run");
  assert.match(jump, /if \(!t\) return start\(\);[\s\S]*return notice\(/);
  // Keys preview, and the jump goes once they rest.
  assert.match(body("onBarKey"), /keyTimer = setTimeout\(settleKeys, 900\)/);
});

test("keys and nudges: ←/→ 10 s, Shift 1 min, Page keys 1 min, Home and End", () => {
  assert.equal(core.keyMove("ArrowRight", false), 10);
  assert.equal(core.keyMove("ArrowLeft", false), -10);
  assert.equal(core.keyMove("ArrowRight", true), 60);
  assert.equal(core.keyMove("ArrowLeft", true), -60);
  assert.equal(core.keyMove("ArrowUp", false), 10);
  assert.equal(core.keyMove("ArrowDown", false), -10);
  assert.equal(core.keyMove("PageUp", false), 60);
  assert.equal(core.keyMove("PageDown", false), -60);
  assert.equal(core.keyMove("Home", false), "home");
  assert.equal(core.keyMove("End", false), "end");
  assert.equal(core.keyMove("a", false), null);
  assert.deepEqual(core.nudges().map((n) => [n.by, n.label]), [
    [-60, "−1 min"],
    [-10, "−10 s"],
    [10, "+10 s"],
    [60, "+1 min"],
  ]);
});

test("Undo puts the run back where it was, plus the time since", () => {
  let state = core.apply(null, { op: "start" }, 0);
  const at = 25 * 60 * 1000,
    before = state.shiftMs;
  state = core.apply(state, core.jumpOp(state, at, 180), at);
  assert.equal(elapsed(state, at + 4000), 184);
  state = core.apply(state, core.undoOp(before), at + 4000);
  assert.deepEqual(core.undoOp(before), { op: "seek", shiftMs: 0 });
  assert.equal(elapsed(state, at + 4000), 25 * 60 + 4, "back at 25:04");
  // Undo of a jump made while paused lands on the paused second.
  let paused = core.apply(core.apply(null, { op: "start" }, 0), { op: "pause" }, 90000);
  const shift = paused.shiftMs;
  paused = core.apply(paused, core.jumpOp(paused, 95000, 400), 95000);
  paused = core.apply(paused, core.undoOp(shift), 97000);
  assert.equal(elapsed(paused, 99000), 90);
});

test("Start at: one start op already partway in", () => {
  const op = core.jumpOp(null, 0, 180);
  const state = core.apply(null, op, 5000);
  assert.equal(elapsed(state, 5000), 180);
  assert.equal(elapsed(state, 65000), 240);
  assert.equal(state.pausedAt, null);
  assert.equal(core.apply(null, { op: "start" }, 5000).shiftMs, 0, "a plain start is at 0:00");
  // Undo after Start at carries on from the top (the run keeps going).
  const undone = core.apply(state, core.undoOp(0), 9000);
  assert.equal(elapsed(undone, 9000), 4);
});

test("after a jump the cues are silent for the steps passed over; Announce says where it landed", () => {
  // From 25:00 to 3:00 in the recipe: inside Chop and the oven.
  const mid = core.landing(recipe, 180);
  assert.equal(mid.start, false, "no new-step beep");
  assert.equal(mid.words, "Chop, 7 minutes left. Preheat the oven, 12 minutes left");
  assert.doesNotMatch(mid.words, /Season|Roast|Rest/, "nothing passed over is said");
  const roast = core.landing(recipe, 1500);
  assert.equal(roast.words, "Roast, 15 minutes left");
  // Seconds are exact under a minute and rounded to 10 s under 10 minutes.
  assert.equal(core.landing(workout, 150).words, "Side plank left, 15 seconds left");
  assert.equal(core.landing(recipe, 2433).words, "Rest and plate, 4 minutes 30 seconds left");
  // Landing on a step's start (Skip, Back, a chip) gets the usual new-step cue.
  assert.equal(core.landing(workout, 120).start, true);
  assert.equal(core.landing(workout, 120.4).start, true);
  assert.equal(core.landing(workout, 122).start, false);
  // In a gap nothing is live, so nothing is said.
  const gap = runConfig(parse("title: G\n+1m | A\n2:00 +1m | B")).steps;
  assert.deepEqual(core.landing(gap, 90), { start: false, words: "" });
  // The runtime: a jump (its own or another device's) takes the landing
  // branch before the step-change and 3-2-1 cues.
  const source = runRuntime.toString();
  assert.match(source, /jumped = announce === "jump" \|\| \(!!prev && prev\.state\.runId === state\.runId && prev\.state\.shiftMs !== state\.shiftMs\)/);
  assert.match(source, /if \(land && !land\.start\) \{\s*if \(cue && land\.words\) say\(land\.words\);\s*\} else if \(cue && cueKey >= 0/);
  assert.match(source, /\} else if \(!land && cue && lastCount === count \+ 1/);
});

test("readouts, tick marks and the step bar's span", () => {
  assert.equal(core.readout(recipe, 750), "12:30 · Season the tray");
  assert.equal(core.readout(recipe, 180), "3:00 · Chop");
  assert.equal(core.readout(recipe, 2700), "45:00 · Done");
  const gap = runConfig(parse("title: G\n+1m | A\n2:00 +1m | B")).steps;
  assert.equal(core.readout(gap, 90), "1:30 · before B");
  assert.deepEqual(core.ticks(recipe), [600, 900, 2400], "step starts, not moments or 0:00");
  assert.equal(core.ticks(workout).length, 16);
  const h = core.header(workout, 80);
  assert.deepEqual([h.from, h.target], [60, 105], "the step bar spans Plank");
  const g = core.header(gap, 90);
  assert.deepEqual([g.from, g.target], [60, 120], "in a gap, the gap");
});

test("the pages: scrubbers, the Jump panel, Start at, gutter jumps and the Undo toast", () => {
  const page = render(read("example.recipe.txt"));
  // The ready card's "Start at…", shown only where scripts run.
  assert.match(page, /<div class="ready-row">.*<\/div><button type="button" class="ready-at" data-html2canvas-ignore hidden><svg[^>]*>.*<\/svg>Start at…<\/button>/);
  assert.match(page, /body\.run-on \.ready-at\{visibility:hidden;\}/);
  // Gutter labels offer a jump; a preview moves the now line.
  assert.match(page, /\.gl-pop\{left:72px;z-index:6;display:inline-flex;align-items:center;gap:8px;height:44px;/);
  assert.match(page, /\.nowh\.pv\{/);
  assert.match(page, /\$\{going \? "Jump to" : "Start at"\} \$\{runCore\.clock\(t\)\}/);
  // The run view: sliders with ARIA, 44 px on touch, the panel's parts.
  assert.match(page, /class="run-scrub \$\{cls\}" data-bar="\$\{bar\}" role="slider" tabindex="0" aria-label="\$\{label\}"/);
  assert.match(page, /\$\{scrubBar\("all", "rc-all", "Jump in the routine"\)\}/);
  assert.match(page, /class="run-scrub rc-sbar" data-bar="step" role="slider" tabindex="0"/);
  assert.match(page, /\$\{scrubBar\("ready", "rc-atbar", "Where to start"\)\}/);
  assert.match(page, /@media\(pointer:coarse\)\{\.run-scrub\{height:44px\}/);
  assert.match(page, /\.run-scrub\.jp-bar\{height:44px\}/);
  assert.match(page, /\.run-scrub\{[^}]*touch-action:none/);
  assert.match(page, /<div class="rv-jp" role="dialog" aria-label="Jump to a time" hidden>/);
  assert.match(page, /\.jp-nudge button,\.jp-act button\{height:44px;/);
  assert.match(page, /\.jp-chip\{[^}]*height:44px;/);
  assert.match(page, /class="rv-ctb run-jump" aria-label="Jump to a time"/);
  assert.match(page, /class="rv-plb run-jump"/);
  assert.match(page, /<div class="run-toast" role="status" aria-live="polite" hidden>.*<span>Undo<\/span><\/button><\/div>/);
  assert.match(page, /toastTimer = setTimeout\(hideNotice, 6000\)/);
  // A jump, and the Jump panel opening or closing, make the sheet follow
  // the run again (under the panel while it is open).
  assert.match(page, /const key2 = \(cols \? "c:" : ""\) \+ \(run\.follow \|\| 0\) \+ ":"/);
  assert.match(page, /inset: panelInset\(\), follow \}\);/);
  // Pointer events for touch and mouse alike.
  assert.match(page, /top\.addEventListener\("pointerdown", onBarDown\)/);
  assert.match(page, /el\.setPointerCapture\(event\.pointerId\)/);
});

test("day timelines carry none of it", () => {
  const day = render(read("example.timeline.txt"));
  assert.doesNotMatch(day, /ready-at|gl-pop|run-scrub|rv-jp|run-toast|timeline:seek/);
  assert.equal(day.replace(/<script>[\s\S]*<\/script>/, "<script></script>"), read("tests/fixtures/example.day.html"));
});
