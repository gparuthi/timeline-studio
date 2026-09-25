// The routine sheet (v2, docs/routines.md §6): the clock inferred from a
// first "+duration" line, the ready card's totals and chips, and the
// elapsed lanes' geometry (lanes, folding, long steps drawn shorter).
// Run: node --test tests/*.test.*
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, render, clockOf, isRest, routineCore, routineSummary, runConfig } = require("../timeline-renderer.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const core = routineCore();
// Items the way the renderer builds them from a parsed routine.
const itemsOf = (model) => model.events.map((e, i) => ({ id: String(i), at: e.at, until: e.until, rest: isRest(e), line: e.line }));
const byTitle = (model, g) => Object.fromEntries(model.events.map((e, i) => [e.title, g.boxes.get(String(i))]));

test("inference: a first event line with a bare +duration is a routine; a clock line wins", () => {
  assert.equal(clockOf("title: T\n+30s | Jog"), "relative");
  assert.equal(clockOf("# comment\ntitle: T\ntheme: future\n\nday: Warm-up\n+1m | Jog"), "relative");
  assert.equal(clockOf("title: T\nasset a: https://x/a.png\n+ 45s | Plank"), "relative");
  assert.equal(clockOf("title: T\n0:00 +10m | Chop\n+5m | Season"), "day", "0:00 could be either clock");
  assert.equal(clockOf("title: T\n08:00 | Coffee"), "day");
  assert.equal(clockOf("title: T\nclock: day\n+30s | Jog"), "day");
  assert.equal(clockOf("title: T\n0:00 | A\nclock: relative"), "relative");
  assert.equal(clockOf("title: T"), "day");
  // The example files lead with a length and carry no clock line.
  for (const file of ["example.routine.txt", "example.recipe.txt"]) {
    assert.doesNotMatch(read(file), /^clock:/m, file);
    assert.equal(parse(read(file)).clock, "relative", file);
  }
  assert.equal(parse(read("example.trip.txt")).clock, "day");
});

test("rests: titled Rest or Break, or given the timer icon by hand; never with a picture or notes", () => {
  const m = parse("title: T\n+45s | Plank\n+15s | Rest\n+15s | break\n+10s | Rest 10s\n+30s | Shake out | | timer\n+30s | Hold\n+5m | Rest and plate\n+15s | Rest\n- Breathe\n+15s | Rest | | | | https://tl.gaup.uk/img/0123456789abcdef.webp");
  assert.deepEqual(
    m.events.map((e) => [e.title, isRest(e)]),
    [
      ["Plank", false],
      ["Rest", true],
      ["break", true],
      ["Rest 10s", true],
      ["Shake out", true],
      ["Hold", false],
      ["Rest and plate", false],
      ["Rest", false],
      ["Rest", false],
    ],
  );
  assert.deepEqual(
    runConfig(m).steps.map((s) => s.rest),
    m.events.map(isRest),
  );
});

test("the ready card: total, counts, and what you need as chips", () => {
  const recipe = parse(read("example.recipe.txt")),
    workout = parse(read("example.routine.txt"));
  assert.equal(core.summary(itemsOf(recipe)), "6 steps · 2 at once");
  assert.equal(routineSummary(recipe), "45 min · 6 steps · 2 at once");
  assert.equal(routineSummary(workout), "10 min · 10 moves · 7 rests");
  assert.equal(core.summary(itemsOf(parse("title: T\n+30s | A"))), "1 step");
  // Chips: split on commas outside brackets, trimmed, a final stop dropped.
  assert.deepEqual(core.chips(["8 chicken thighs, 2 red onions, 3 peppers", "Olive oil, salt, smoked paprika."]), [
    "8 chicken thighs",
    "2 red onions",
    "3 peppers",
    "Olive oil",
    "salt",
    "smoked paprika",
  ]);
  assert.deepEqual(core.chips(["Butter (cold, cubed), flour", " , ", "A mat and a bottle of water"]), ["Butter (cold, cubed)", "flour", "A mat and a bottle of water"]);
  const page = render(read("example.recipe.txt"));
  assert.match(page, /<p class="ready-kv"><b>45 min<\/b> <span>6 steps · 2 at once<\/span><\/p>/);
  assert.equal((page.match(/class="chip"/g) || []).length, 6);
  assert.match(page, /data-chip="salt">.*?Salt<\/button>/, "shown with a capital, kept as written");
  // Every note: line of a routine is a chip, section notes too.
  assert.match(render(read("example.routine.txt")), /data-chip="A mat and a bottle of water"/);
  assert.doesNotMatch(render(read("example.routine.txt")), /Helpful Notes/);
});

test("labels: lengths on chips and starts in the gutter, never a clock time", () => {
  assert.deepEqual([45, 60, 75, 90, 600, 1500, 3600, 5400, 7500, 70].map(core.chip), ["45s", "1 min", "1¼ min", "1½ min", "10 min", "25 min", "1 h", "1 h 30", "2 h 5", "1:10"]);
  assert.deepEqual([0, 30, 20, 60, 600, 1650, 525, 4500, 7500, 7200, 320].map(core.atLabel), [
    "start",
    "at ½ min",
    "at 20s",
    "at 1 min",
    "at 10 min",
    "at 27½ min",
    "at 8¾ min",
    "at 1 h 15",
    "at 2 h 5",
    "at 2 h",
    "at 5:20",
  ]);
  assert.deepEqual([60, 465, 75, 3900].map(core.sectionLength), ["1 min", "7 min 45s", "1 min 15s", "1 h 5 min"]);
});

test("lanes: overlapping steps side by side, at most two; a third folds into the second lane", () => {
  const recipe = parse(read("example.recipe.txt")),
    info = core.lanes(itemsOf(recipe)),
    lane = (title) => info.get(String(recipe.events.findIndex((e) => e.title === title)));
  assert.deepEqual(lane("Preheat the oven"), { lane: 0, minis: [], wide: false });
  assert.deepEqual(lane("Chop"), { lane: 1, minis: [], wide: false });
  assert.deepEqual(lane("Season the tray"), { lane: 1, minis: [], wide: false }, "Chop's lane is free at 10:00");
  assert.equal(lane("Roast").wide, true, "nothing else runs during the roast");
  assert.equal(lane("Toss the vegetables"), undefined, "a moment takes no lane");
  const ragu = parse("title: Ragù\n+15m | Brown the meat\n+2h | Braise\n2:05:00 +10m | Boil pasta\n2:10:00 +3m | Grate cheese\n2:15:00 +5m | Toss and serve\n1:15:00 | Stir, add water");
  const r = core.lanes(itemsOf(ragu)),
    id = (title) => String(ragu.events.findIndex((e) => e.title === title));
  assert.equal(r.get(id("Braise")).lane, 0);
  assert.equal(r.get(id("Boil pasta")).lane, 1);
  assert.deepEqual(r.get(id("Grate cheese")), { mini: true, host: id("Boil pasta") });
  assert.deepEqual(r.get(id("Boil pasta")).minis, [id("Grate cheese")]);
  assert.equal(core.atOnce(itemsOf(ragu)), 3, "the ready card still counts the folded step");
  assert.match(
    render("title: Ragù\n+15m | Brown the meat\n+2h | Braise\n2:05:00 +10m | Boil pasta\n2:10:00 +3m | Grate cheese\n2:15:00 +5m | Toss and serve"),
    /<div class="mini sky" data-k="mini"[^>]*><b>Grate cheese<\/b><span class="dur">3 min<\/span><\/div>/,
  );
});

test("geometry: minimum heights, stacked lanes, rests, sections and the Done row", () => {
  const recipe = parse(read("example.recipe.txt")),
    g = core.layout(itemsOf(recipe), []),
    box = byTitle(recipe, g);
  // Preheat spans Chop and Season in the lane beside it, gap included.
  assert.equal(box["Preheat the oven"].top, 0);
  assert.equal(box["Chop"].top, 0);
  assert.equal(box["Season the tray"].top, box["Chop"].height + core.GAP);
  assert.equal(box["Preheat the oven"].height, box["Season the tray"].top + box["Season the tray"].height);
  assert.ok(box["Season the tray"].height >= core.MIN.lane, "a 5-min step still fits its card");
  assert.equal(box["Roast"].lane, "w");
  assert.equal(box["Roast"].top, box["Preheat the oven"].height + core.GAP);
  // The moment is a dashed line across the roast, clear of its title.
  assert.equal(box["Toss the vegetables"].host, String(recipe.events.findIndex((e) => e.title === "Roast")));
  assert.ok(box["Toss the vegetables"].top - box["Roast"].top >= 44);
  assert.equal(g.done, box["Rest and plate"].top + box["Rest and plate"].height + core.GAP + 10);
  // Measured needs win over the minimums (notes opened, long titles).
  const grown = byTitle(recipe, core.layout(itemsOf(recipe), [], { [recipe.events.findIndex((e) => e.title === "Chop")]: 150 }));
  assert.equal(grown["Chop"].height, 150);
  assert.equal(grown["Season the tray"].top, 154);
  // A workout: one lane, 58 px moves, 28 px rests, a header per section.
  const workout = parse(read("example.routine.txt")),
    sections = workout.days.map((d, i) => ({ id: "s" + i, at: d.startSec })),
    w = core.layout(itemsOf(workout), sections),
    wb = byTitle(workout, w);
  assert.ok(workout.events.every((e, i) => w.boxes.get(String(i)).lane === "w"));
  assert.equal(wb["Plank"].height, core.MIN.wide);
  const rest = w.boxes.get(String(workout.events.findIndex((e) => e.title === "Rest")));
  assert.equal(rest.height, core.MIN.rest);
  assert.equal(rest.top, wb["Plank"].top + wb["Plank"].height + core.GAP);
  assert.deepEqual(
    w.sections.map((s) => s.top),
    [0, wb["Jog in place"].top + wb["Jog in place"].height + core.GAP, w.sections[2].top],
  );
  assert.equal(wb["Jog in place"].top, core.MIN.section + core.GAP);
  // A live rest grows so its countdown fits.
  const restId = String(workout.events.findIndex((e) => e.title === "Rest"));
  assert.equal(core.layout(itemsOf(workout), sections, {}, { liveRest: restId }).boxes.get(restId).height, core.MIN.liveRest);
  // Rests get no gutter label; moves do, from "start".
  assert.deepEqual(
    w.labels.filter((l) => !l.hidden).map((l) => l.text).slice(0, 4),
    ["start", "at 1 min", "at 2 min", "at 3 min"],
  );
});

test("long steps are drawn about 15 minutes tall, with a break that carries their length", () => {
  const recipe = parse(read("example.recipe.txt")),
    g = core.layout(itemsOf(recipe), []),
    roast = byTitle(recipe, g)["Roast"];
  // 25 min at 12 px a minute would be 300 px; drawn 15 min (180 px) instead.
  assert.equal(roast.height + core.GAP, 180);
  assert.notEqual(roast.brk, null);
  const toss = byTitle(recipe, g)["Toss the vegetables"].top - roast.top;
  assert.ok(roast.brk + 34 <= toss || roast.brk >= toss, "the break never covers the moment");
  assert.match(render(read("example.recipe.txt")), /<div class="brk" style="top:[\d.]+px"><span>25 min<\/span><\/div>/);
  // A 2-hour braise is drawn no taller than the roast, and the steps
  // after it are back on the plain scale.
  const ragu = parse("title: Ragù\n+2h | Braise\n+10m | Boil pasta\n1:00:00 | Stir"),
    rg = byTitle(ragu, core.layout(itemsOf(ragu), []));
  assert.ok(rg["Braise"].height + core.GAP <= 181);
  assert.equal(rg["Boil pasta"].height + core.GAP, 120);
  // A step under 15 min, or one with other steps beside it all along, is not shortened.
  const plain = parse("title: T\n+12m | Simmer"),
    pg = core.layout(itemsOf(plain), []);
  assert.equal(pg.boxes.get("0").height + core.GAP, 144);
  assert.equal(pg.boxes.get("0").brk, null);
});

test("the now line follows elapsed time through the drawn scale", () => {
  const recipe = parse(read("example.recipe.txt")),
    g = core.layout(itemsOf(recipe), []),
    box = byTitle(recipe, g);
  assert.equal(core.yAt(g.map, 0), 0);
  assert.equal(core.yAt(g.map, 900), box["Roast"].top);
  assert.ok(Math.abs(core.yAt(g.map, 27.5 * 60) - box["Toss the vegetables"].top) < 0.2);
  const mid = core.yAt(g.map, 300);
  assert.ok(mid > 0 && mid < box["Chop"].height);
  assert.equal(core.yAt(g.map, 99999), core.yAt(g.map, 2700));
});

test("run view: the header stays compact and the live card carries the notes, after its description", () => {
  const text = "title: Soup\n+10m | Prep | Chop the onion and the tomato | | sage\n- 1 onion\n- 1 tomato\n+8m | Saute | In oil | | sand\n- 1 tbsp oil";
  const page = render(text);
  // The run header has no notes list and one line of description.
  assert.doesNotMatch(page, /run-notes/);
  assert.match(page, /\.run-detail\{[^}]*white-space:nowrap;[^}]*text-overflow:ellipsis/);
  // Its big picture is for wide screens only.
  assert.match(page, /@media\(max-width:699px\),\(max-height:699px\)\{\.run-photo\{display:none!important\}\}/);
  // A full-width card: title, "2 notes", length and description in one
  // row, ordered so open notes come after the description.
  const prep = page.match(/<div class="cd w [^"]*"[^>]*data-line="2"[^>]*>(.*?)<\/div><span class="cd-th/)[1];
  assert.match(prep, /^<div class="cd-row"><h3 class="cd-t">Prep<\/h3><details class="step-notes">.*<\/details><span class="dur">10 min<\/span><p class="cd-d">Chop the onion and the tomato<\/p>$/);
  assert.match(page, /\.cd\.w \.cd-d\{order:3;flex-basis:100%;/);
  assert.match(page, /\.cd \.step-notes\[open\]\{order:4;flex-basis:100%;\}/);
  // The live card shows its whole description.
  assert.match(page, /\.lanes \.cd\.live \.cd-d\{display:block;-webkit-line-clamp:none;white-space:normal;\}/);
  // The two sound switches share the row equally, and it stays compact on a wide screen.
  assert.match(page, /\.run-toggles\{display:flex;gap:8px;max-width:440px;margin:6px auto 8px\}/);
  assert.match(page, /\.run-tg\{display:flex;flex:1 1 0;/);
  assert.doesNotMatch(page, /\.run-tg\.run-announce\{flex:1/);
});

test("run view: the page follows the run to the top of the live steps", () => {
  // The highest live step (or the rest and the move up next) goes just
  // under the header; with nothing live or next, the now line does.
  assert.equal(core.followTop([240, 0], 72), 0);
  assert.equal(core.followTop([410, 438], 415), 410);
  assert.equal(core.followTop([], 500), 440);
});

test("day timelines carry none of the routine sheet", () => {
  const page = render(read("example.timeline.txt"));
  assert.doesNotMatch(page, /class="lanes"|ready-go|routineRuntime/);
});
