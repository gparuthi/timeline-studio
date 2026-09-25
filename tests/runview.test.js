// The run view (docs/routines.md §7): which layout a screen gets, what the
// one-row header says, up next, the ⋯ menu, the status and Done lines, and
// what the page carries for the two-column view and the ready card's sound
// switches.
// Run: node --test tests/*.test.*
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, render, runCore, runConfig } = require("../timeline-renderer.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const core = runCore();
const recipe = runConfig(parse(read("example.recipe.txt"))).steps;
const workout = runConfig(parse(read("example.routine.txt"))).steps;

test("layout: two columns at 800 x 560 and up, the one-row header below", () => {
  assert.equal(core.layoutFor(390, 844), "bar", "phone");
  assert.equal(core.layoutFor(844, 390), "bar", "phone on its side");
  assert.equal(core.layoutFor(820, 1180), "cols", "upright iPad");
  assert.equal(core.layoutFor(1024, 768), "cols");
  assert.equal(core.layoutFor(1440, 900), "cols");
  assert.equal(core.layoutFor(799, 1000), "bar");
  assert.equal(core.layoutFor(800, 559), "bar");
  assert.equal(core.layoutFor(800, 560), "cols");
});

test("header: two live steps, the one ending soonest drives it and the other is a chip", () => {
  const h = core.header(recipe, 6 * 60 + 3);
  assert.equal(h.title, "Chop");
  assert.equal(h.countdown, "3:57");
  assert.equal(h.then, null);
  assert.equal(h.grey, false);
  assert.equal(h.label, "left of 10 min");
  assert.equal(h.of, "6:03 of 45:00");
  assert.equal(h.sub.kind, "also");
  assert.equal(h.sub.step.title, "Preheat the oven");
  assert.equal(h.sub.left, "8:57");
  assert.equal(h.sub.more, 0);
  assert.ok(Math.abs(h.pct - 60.5) < 0.01);
});

test("header: a rest reads Rest → the next move, grey, with moves done", () => {
  const h = core.header(workout, 110);
  assert.equal(h.rest, true);
  assert.equal(h.title, "Rest");
  assert.equal(h.then, "Side plank L");
  assert.equal(h.countdown, "0:10");
  assert.equal(h.grey, true);
  assert.equal(h.label, "then Side plank L");
  assert.deepEqual(h.sub, { kind: "moves", text: "move 2 of 10 done" });
});

test("header: paused, a gap, and one live step on a routine without rests", () => {
  const paused = core.header(workout, 80, { paused: true });
  assert.equal(paused.title, "Plank");
  assert.equal(paused.countdown, "0:25");
  assert.equal(paused.grey, true);
  assert.equal(paused.label, "paused");
  assert.deepEqual(paused.sub, { kind: "paused", text: "Paused · 1:20 of 10:00" });
  const gap = core.header(runConfig(parse("title: G\n+1m | A\n2:00 +1m | B")).steps, 90);
  assert.equal(gap.title, "Get ready");
  assert.equal(gap.then, "B");
  assert.equal(gap.countdown, "0:30");
  assert.equal(gap.grey, true);
  assert.equal(gap.pct, 50);
  const roast = core.header(recipe, 1000);
  assert.equal(roast.title, "Roast");
  assert.deepEqual(roast.sub, { kind: "elapsed", text: "16:40 of 45:00" });
  const three = core.header(runConfig(parse("title: T\nclock: relative\n0:00 +3m | A\n0:00 +2m | B\n0:00 +1m | C")).steps, 30);
  assert.equal(three.title, "C");
  assert.equal(three.sub.step.title, "B");
  assert.equal(three.sub.more, 1);
});

test("up next: the next move to start, never a rest or a moment", () => {
  assert.equal(core.upNext(recipe, 363).title, "Season the tray");
  assert.equal(core.upNext(recipe, 1700).title, "Rest and plate", "the moment at 27½ min is skipped");
  assert.equal(core.upNext(workout, 80).title, "Side plank L", "the rest after Plank is skipped");
  assert.equal(core.upNext(workout, 110).title, "Side plank L");
  assert.equal(core.upNext(workout, 590), null);
});

test("the ⋯ menu: status, Back / Skip / Stop, the switches, Edit; Back and Skip close it", () => {
  const items = core.menu();
  assert.deepEqual(items.map((i) => i.id), ["status", "back", "skip", "stop", "beeps", "announce", "edit"]);
  assert.deepEqual(items.filter((i) => i.closes).map((i) => i.id), ["back", "skip", "edit"]);
  assert.deepEqual(items.filter((i) => i.toggle).map((i) => i.label), ["Beeps", "Announce steps"]);
  assert.equal(items.find((i) => i.id === "stop").confirm, true, "Stop asks first");
  // The page builds the menu in that order.
  const page = render(read("example.recipe.txt"));
  const menu = page.match(/core\s*\.menu\(\)/);
  assert.ok(menu, "the run view builds its menu from core.menu()");
});

test("status and Done lines", () => {
  assert.deepEqual(core.status(363, 2700, false, "6:15 PM"), [
    ["elapsed", "6:03"],
    ["left", "38:57"],
    ["done ≈", "6:15 PM"],
  ]);
  assert.deepEqual(core.status(363, 2700, true, "6:15 PM").at(-1), ["paused", ""]);
  assert.deepEqual(core.finished(614000, 600), { title: "Done · 10:14", sub: "planned 10 min" });
});

test("runConfig carries the ready card for the two-column view, and the sheet's labels", () => {
  const config = runConfig(parse(read("example.recipe.txt")));
  assert.equal(config.subtitle, "Chicken thighs, peppers and onions for four");
  assert.equal(config.summary, "6 steps · 2 at once");
  assert.deepEqual(config.chips, ["8 chicken thighs", "2 red onions", "3 peppers", "Olive oil", "salt", "smoked paprika"]);
  assert.equal(config.cover, "");
  const season = config.steps.find((s) => s.title === "Season the tray");
  assert.equal(season.atText, "at 10 min");
  assert.equal(season.lenText, "5 min");
  // The key still follows the steps only.
  assert.equal(config.key, runConfig(parse(read("example.recipe.txt").replace("subtitle:", "# \nsubtitle:"))).key);
});

test("the page: sound switches in the ready card below the chips; two columns hide the sheet's ready card", () => {
  const page = render(read("example.recipe.txt"));
  assert.match(page, /<div class="chips"[^>]*>.*<\/div><div class="ready-sound" hidden data-html2canvas-ignore><button type="button" class="ready-tg" data-sound="beeps" aria-pressed="true">.*<span>Beeps<\/span>.*data-sound="announce" aria-pressed="false">.*<span>Announce steps<\/span>/);
  assert.match(page, /body\.run-cols \.ready\{display:none;\}/);
  // The sheet gets the run core for up next.
  assert.match(page, /\(function routineRuntime\(makeCore, makeRunCore\)[\s\S]*\}\)\(function routineCore\(\)[\s\S]*, function runCore\(\)/);
  // A day timeline has none of it.
  const day = render(read("example.timeline.txt"));
  assert.doesNotMatch(day, /ready-sound|run-cols/);
});
