// Lanes Fill (docs/routines.md §9): the scale picked from the screen's
// height, the fallback for long routines, a note sentence that stays a
// line, the Sauté icon, the left column's Then and What you need, the live
// card's bar (no tint), and the wide-screen sizes.
// Run: node --test tests/*.test.*
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, render, isRest, routineCore, runCore, runConfig } = require("../timeline-renderer.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const core = routineCore();
const itemsOf = (model) => model.events.map((e, i) => ({ id: String(i), at: e.at, until: e.until, rest: isRest(e), line: e.line }));
const byTitle = (model, g) => Object.fromEntries(model.events.map((e, i) => [e.title, g.boxes.get(String(i))]));
// Every card measured at `px` (a wide screen's cards need about 76).
const needsOf = (model, px) => Object.fromEntries(model.events.map((e, i) => [String(i), e.until === undefined || isRest(e) ? 0 : px]));

// The owner's soup as the MCP wrote it, one step at a time (1 h 27 min,
// nothing overlaps).
const SOUP = `title: Yemeni Chicken Soup
note: 1 kg chicken thighs, 1 onion, 4 garlic cloves, 2 tomatoes, 2 carrots, 2 potatoes, Hawaij, Turmeric, Coriander, Lemon
note: About 87 minutes including prep

+10m | Prep ingredients | Chop, measure and set everything out | | sage
- 1 onion, diced
- 4 garlic cloves, grated
- 2 carrots and 2 potatoes in chunks
+8m | Sauté onion | Soft and golden in the oil | | sand
+1m | Bloom spices | Garlic and hawaij, stir until fragrant | | sand
+3m | Cook tomato | Until it breaks down | | sand
+5m | Sauté chicken | Turn the pieces once | | sand
+5m | Bring to boil | 1.5 l water | | sky
+25m | Simmer chicken | Chicken and water, lid ajar | | sand
- Skim the foam in the first 5 minutes
+22m | Add carrots | Carrots and potatoes in, keep simmering | | sage
+7m | Reduce broth | Lid off, season to taste | | sand
+1m | Finish and serve | Coriander and lemon, with bread | | sky`;

test("fill: the largest scale whose sheet fits the view, drawn whole", () => {
  const soup = parse(SOUP),
    items = itemsOf(soup),
    needs = needsOf(soup, 76),
    room = 1034 - 64; // the owner's 2000 x 1034 laptop, lanes 32 px from top and bottom
  const g = core.fit(items, [], needs, {}, room);
  assert.equal(g.fits, true);
  assert.ok(g.height <= room, `${g.height} fits ${room}`);
  assert.ok(g.scale > core.SCALE.min && g.scale < core.PX, `the soup at ${g.scale} px a minute`);
  // The largest: a little more and it no longer fits.
  assert.ok(core.layout(items, [], needs, { scale: g.scale + 0.25, breaks: false }).height > room);
  // Drawn whole: no zig-zag, and the heights read true.
  const box = byTitle(soup, g);
  assert.ok(soup.events.every((e, i) => g.boxes.get(String(i)).brk === null));
  assert.ok(box["Simmer chicken"].height > 1.9 * box["Sauté onion"].height, "the 25-min simmer is about twice the 8-min sauté, where 12 px a minute and a break drew them the same");
  assert.ok(box["Simmer chicken"].height > box["Add carrots"].height && box["Add carrots"].height > box["Reduce broth"].height);
  // A taller view (2000 x 1250), a larger scale: the simmer is 3 sautés.
  const tall = core.fit(items, [], needs, {}, 1250 - 64),
    tallBox = byTitle(soup, tall);
  assert.ok(tall.scale > g.scale);
  assert.ok(tallBox["Simmer chicken"].height >= 3 * tallBox["Sauté onion"].height);
  // The recipe at 1440 x 900 fits whole at about 16 px a minute.
  const recipe = parse(read("example.recipe.txt")),
    r = core.fit(itemsOf(recipe), [], needsOf(recipe, 100), {}, 900 - 64);
  assert.equal(r.fits, true);
  assert.ok(r.scale >= 14 && r.scale <= 20, `recipe at ${r.scale}`);
  assert.equal(byTitle(recipe, r)["Roast"].brk, null, "the roast needs no break");
  // The same on a phone: under the header (844 - 68), the 45-min recipe fits.
  const phone = core.fit(itemsOf(recipe), [], needsOf(recipe, 88), {}, 844 - 68 - 20);
  assert.equal(phone.fits, true);
  assert.ok(phone.scale > core.PX, `phone at ${phone.scale}`);
});

test("fill tier 2: one-line cards (not the live step or up next) let the owner's soup fit 2000 x 1034", () => {
  const soup = parse(SOUP),
    items = itemsOf(soup),
    id = (title) => String(soup.events.findIndex((e) => e.title === title)),
    // Full cards need 86 px at 2000 x 1034, one-line ones 61.
    needs = needsOf(soup, 86),
    compact = needsOf(soup, 61),
    room = 1034 - 28 - 16;
  // Full cards alone do not fit, even at 6 px a minute.
  assert.ok(core.layout(items, [], needs, { scale: core.SCALE.min, breaks: false }).height > room);
  // Running at 32:35: the simmer is live and the carrots are up next; both stay full.
  const keep = [id("Simmer chicken"), id("Add carrots")],
    g = core.fit(items, [], needs, {}, room, { compact, keep }),
    box = byTitle(soup, g);
  assert.equal(g.tier, 2);
  assert.equal(g.fits, true);
  assert.ok(g.height <= room);
  assert.ok(g.scale >= core.SCALE.compactMin, `the soup at ${g.scale} px a minute`);
  assert.ok(soup.events.every((e, i) => g.boxes.get(String(i)).brk === null), "drawn whole");
  assert.ok(box["Simmer chicken"].height >= 2.5 * box["Sauté onion"].height, `simmer ${box["Simmer chicken"].height} vs sauté ${box["Sauté onion"].height}`);
  assert.ok(box["Simmer chicken"].height >= 86 && box["Add carrots"].height >= 86, "the live step and up next are full cards");
  assert.ok(g.compact.includes(id("Sauté onion")) && g.compact.includes(id("Bloom spices")));
  assert.ok(!g.compact.includes(id("Simmer chicken")) && !g.compact.includes(id("Add carrots")));
  // Before Start (nothing kept full) and at 1440 x 900 (78 / 55 px cards) it fits too.
  assert.equal(core.fit(items, [], needs, {}, room, { compact }).fits, true);
  const small = core.fit(items, [], needsOf(soup, 78), {}, 900 - 28 - 16, { compact: needsOf(soup, 55), keep });
  assert.equal(small.fits, true);
  assert.ok(byTitle(soup, small)["Simmer chicken"].height >= 2 * byTitle(soup, small)["Sauté onion"].height);
  // On a phone (844 tall, under the header) one-line cards go below the
  // 58 px full-width minimum, and the soup fits there too.
  const phone = core.fit(items, [], needsOf(soup, 60), {}, 844 - 57 - 20, { compact: needsOf(soup, 40), keep });
  assert.equal(phone.tier, 2);
  assert.ok(byTitle(soup, phone)["Bloom spices"].height < core.MIN.wide);
  assert.ok(byTitle(soup, phone)["Bloom spices"].height >= core.MIN.slim);
});

test("fill tiers 3 and 4: up to 2 hours at 8 px a minute with one-line cards; longer, 12 px a minute with breaks", () => {
  // The 17-step workout at 1440 x 900: too many moves to fit, so 8 px a
  // minute and one line a move (up next stays full); it scrolls.
  const workout = parse(read("example.routine.txt")),
    sections = workout.days.map((d, i) => ({ id: "s" + i, at: d.startSec })),
    upNext = String(workout.events.findIndex((e) => e.title === "Side plank L")),
    w = core.fit(itemsOf(workout), sections, needsOf(workout, 76), {}, 856, { compact: needsOf(workout, 56), keep: [upNext] });
  assert.equal(w.tier, 3);
  assert.equal(w.fits, false);
  assert.equal(w.scale, core.SCALE.proportional);
  assert.equal(w.breaks, false);
  assert.equal(w.boxes.get(upNext).height, 76, "up next is a full card");
  assert.ok(workout.events.every((e, i) => isRest(e) || String(i) === upNext || w.boxes.get(String(i)).height >= 56));
  // A 2-hour braise on a short view: tier 3, proportional, no break.
  const braise = parse("title: Braise\n+15m | Brown the meat\n+1h35m | Braise\n+10m | Boil pasta"),
    b = core.fit(itemsOf(braise), [], needsOf(braise, 76), {}, 500, { compact: needsOf(braise, 56) });
  assert.equal(b.tier, 3);
  assert.equal(byTitle(braise, b)["Braise"].brk, null);
  assert.ok(Math.abs(byTitle(braise, b)["Braise"].height + core.GAP - 95 * 8) < 1, "95 minutes at 8 px a minute");
  // Past 2 hours: today's 12 px a minute, the long step broken, full cards.
  const ragu = parse("title: Ragù\n+15m | Brown the meat\n+2h | Braise\n2:15:00 +10m | Boil pasta\n2:25:00 +5m | Toss and serve"),
    rg = core.fit(itemsOf(ragu), [], needsOf(ragu, 76), {}, 500, { compact: needsOf(ragu, 56) });
  assert.equal(rg.tier, 4);
  assert.equal(rg.scale, core.PX);
  assert.notEqual(byTitle(ragu, rg)["Braise"].brk, null);
  assert.deepEqual(rg.compact, []);
  assert.deepEqual(rg.map, core.layout(itemsOf(ragu), [], needsOf(ragu, 76)).map, "exactly the plain layout");
  // Under 2 hours but one step longer than two views at 8 px a minute: tier 4 too.
  const long = parse("title: T\n+5m | Prep\n+1h50m | Proof");
  assert.equal(core.fit(itemsOf(long), [], needsOf(long, 76), {}, 400, { compact: needsOf(long, 56) }).tier, 4);
  // No view to fit (a static copy): the plain layout.
  assert.equal(core.fit(itemsOf(ragu), [], {}, {}, 0).fits, false);
  // The scale option alone: 12 px a minute unless given, and breaks off on request.
  const plain = parse("title: T\n+30m | Simmer");
  assert.equal(core.layout(itemsOf(plain), []).boxes.get("0").height + core.GAP, 180, "broken to 15 min");
  assert.equal(core.layout(itemsOf(plain), [], {}, { breaks: false }).boxes.get("0").height + core.GAP, 360);
  assert.equal(core.layout(itemsOf(plain), [], {}, { scale: 20, breaks: false }).boxes.get("0").height + core.GAP, 600);
});

test("a note part that reads as a sentence stays a line under the chips", () => {
  assert.deepEqual(core.chips(["1 kg chicken thighs, 1 onion, Hawaij", "About 77 minutes including prep"]), ["1 kg chicken thighs", "1 onion", "Hawaij"]);
  assert.deepEqual(core.noteLines(["1 kg chicken thighs, 1 onion, Hawaij", "About 77 minutes including prep"]), ["About 77 minutes including prep"]);
  assert.equal(core.sentence("A mat and a bottle of water"), false, "small words do not count");
  assert.equal(core.sentence("Salt and pepper to taste"), false);
  assert.equal(core.sentence("Serve it hot."), false, "a short sentence is still short");
  assert.equal(core.sentence("Leave the dough to rest."), true, "four words and a full stop");
  const page = render(SOUP),
    config = runConfig(parse(SOUP));
  assert.doesNotMatch(page, /data-chip="About/);
  assert.match(page, /<ul class="ready-notes"><li>About 87 minutes including prep<\/li><\/ul>/);
  assert.equal(config.chips.length, 10);
  assert.deepEqual(config.lines, ["About 87 minutes including prep"]);
});

test("the icon guess knows Sauté and café (JavaScript's \\b does not), and brown and sear are the pan", () => {
  const m = parse("title: T\n+8m | Sauté onion\n+2m | Stir-fry\n+5m | Café stop\n+1m | Plank\n+1m | Prep ingredients\n+5m | Brown chicken\n+3m | Sear the steak");
  assert.deepEqual(
    m.events.map((e) => e.icon),
    ["pot", "pot", "coffee", "dumbbell", "meal", "pot", "pot"],
  );
  assert.match(render("title: T\n+8m | Sauté onion | Soft"), /<svg viewBox="0 0 40 40"><use href="#pot"\/><\/svg>/);
});

test("the left column: Then after Up next, and What you need, dropping off in that order", () => {
  const rc = runCore(),
    recipe = runConfig(parse(read("example.recipe.txt"))).steps;
  // 6:03: Up next is Season the tray; then the roast, the toss and the plating.
  assert.equal(rc.upNext(recipe, 363).title, "Season the tray");
  assert.deepEqual(
    rc.then(recipe, 363).map((s) => [s.atText, s.title, s.lenText || ""]),
    [
      ["at 15 min", "Roast", "25 min"],
      ["at 27½ min", "Toss the vegetables", ""],
      ["at 40 min", "Rest and plate", "5 min"],
    ],
  );
  // 20:00: Up next is the plating; the toss still to come is Then.
  assert.deepEqual(rc.then(recipe, 1200).map((s) => s.title), ["Toss the vegetables"]);
  assert.deepEqual(rc.then(recipe, 2500), []);
  // A workout's Then leaves the rests out.
  const workout = runConfig(parse(read("example.routine.txt"))).steps;
  assert.ok(rc.then(workout, 10).every((s) => !s.rest));
  assert.equal(rc.then(workout, 10).length, 3);
  // The page: both blocks under Up next, What you need as a checklist with
  // its count, shared ticks, and What you need dropping off first.
  const page = render(read("example.recipe.txt"));
  assert.match(page, /<div class="rc-nx" hidden>.*?<\/div><div class="rc-then" hidden><div class="rc-kick">Then<\/div><ul class="rc-then-l"><\/ul><\/div><div class="rc-wyn" hidden><div class="rc-kick rc-wyn-k"><\/div><div class="rc-chips rc-ckl"><\/div><\/div><div class="rc-grow"><\/div>/);
  assert.match(page, /What you need · \$\{got\} of \$\{chips\.length\}/);
  assert.match(page, /for \(const block of \[ui\.wyn, ui\.then\]\)/);
  assert.match(page, /<div class="rc-need" hidden><div class="rc-kick">What you need<\/div><div class="rc-chips rc-ckl"><\/div><ul class="rc-lines" hidden><\/ul><\/div>/);
  assert.match(page, /const tickKey = \(\) => "timeline-ticks:" \+ title;/);
});

test("the live card: its own background, a green bar down its left edge and a countdown chip", () => {
  const page = render(read("example.recipe.txt"));
  assert.doesNotMatch(page, /#3ecf8e24 0 var\(--fy/, "no tint down to the now line");
  assert.match(page, /\.lanes \.cd\.live::after\{content:'';position:absolute;left:0;top:0;width:5px;height:var\(--fy,0px\);max-height:100%;/);
  assert.match(page, /\.dur\.lv\{background:#3ecf8e;/);
  assert.match(page, /const text = isLive \? `\$\{runCore\.clock\(Math\.ceil\(until - e - 1e-6\)\)\} left` : chip\.dataset\.len;/);
  // The now line runs behind the cards, which are opaque.
  assert.match(page, /\.nowh\{position:absolute;left:66px;right:-8px;height:2px;z-index:0;/);
  assert.match(page, /\.cd\{z-index:1;[^}]*background-color:var\(--paper\);/);
});

test("the sheet on a wide screen: no width cap, sizes that scale, notes inline on wide cards", () => {
  const page = render(SOUP);
  // Two columns lift the 760 px cap; the lanes take the column less 32 px a side.
  assert.match(page, /\.sheet\.routine\{max-width:760px;/, "phones and narrow views keep it");
  assert.match(page, /body\.run-cols \.sheet\.routine\{max-width:none;margin:0;padding:0 32px 24px;/);
  assert.match(page, /body\.run-cols \.lanes\{margin:28px 0 0;\}/);
  // The artboard's sizes at 16:10 (1.4vw is 2.24vh there), no taller on a wider screen.
  assert.match(page, /body\.run-cols \.cd-t\{font-size:clamp\(14px,min\(calc\(1\.4 \* var\(--vw,1vw\)\),calc\(2\.24 \* var\(--vh,1vh\)\)\),24px\);/);
  assert.match(page, /body\.run-cols \.cd-d\{[^}]*font-size:clamp\(12px,min\(calc\(1\.05 \* var\(--vw,1vw\)\),calc\(1\.68 \* var\(--vh,1vh\)\)\),17px\);/);
  assert.match(page, /--th:clamp\(40px,min\(calc\(5 \* var\(--vw,1vw\)\),calc\(8 \* var\(--vh,1vh\)\)\),96px\);/);
  assert.match(page, /body\.run-cols \.gl\{[^}]*font-size:clamp\(13px,calc\(\.75 \* var\(--vw,1vw\)\),15px\);/);
  // A wide card with notes carries them for printing in columns; the live one keeps them folded.
  assert.match(page, /<div class="cd w sage ly has-inl"[^>]*data-line="5"[^>]*>.*?<\/span><ul class="cd-inl"><li>1 onion, diced<\/li><li>4 garlic cloves, grated<\/li><li>2 carrots and 2 potatoes in chunks<\/li><\/ul><\/div>/);
  assert.match(page, /body\.run-cols \.cd\.w\.has-inl:not\(\.live\):not\(\.cp\)>\.cd-inl\{display:block;[^}]*columns:170px 3;/);
  assert.match(page, /body\.run-cols \.cd\.w\.has-inl:not\(\.live\):not\(\.cp\) \.step-notes\{display:none;\}/);
  // One-line cards (tier 2 and 3): title · description · length, a smaller picture;
  // the page measures them one line and keeps the live step and up next full.
  assert.match(page, /\.cd\.w\.cp>\.cd-row\{flex-wrap:nowrap;/);
  assert.match(page, /\.cd\.w\.cp \.cd-d::before\{content:'· ';\}/);
  assert.match(page, /--thc:clamp\(28px,min\(calc\(2\.6 \* var\(--vw,1vw\)\),calc\(4\.16 \* var\(--vh,1vh\)\)\),44px\);/);
  assert.match(page, /keep = cards\.filter\(\(el\) => el\.classList\.contains\("live"\) \|\| el\.classList\.contains\("upnext"\)\)/);
  assert.match(page, /core\.fit\(items, sections, needs, \{ liveRest \}, room, \{ compact, keep \}\)/);
  // A long step carries its length both on the break and on a chip (shown when drawn whole).
  const recipe = render(read("example.recipe.txt"));
  assert.match(recipe, /<div class="cd w sand ly bk"[^>]*><div class="cd-row"><h3 class="cd-t">Roast<\/h3><span class="dur">25 min<\/span>/);
  assert.match(recipe, /\.brk\[hidden\]\{display:none;\}/);
  assert.match(recipe, /\.cd\.bk>\.cd-row>\.dur:not\(\.lv\),\.cd\.bk>\.cd-ft>\.dur:not\(\.lv\)\{display:none;\}/);
  // The run tells the sheet the room it can fill and the screen's width.
  assert.match(recipe, /next\.room = roomHeight\(\);\s*next\.vw = window\.innerWidth;/);
  // The whole-routine bar's readout takes the title row's place instead of covering half of it.
  assert.match(recipe, /\.rc-all \.sc-read\{left:0!important;right:0;bottom:calc\(100% - 4px\);/);
});

test("picture guidance: one picture per step, never a collage, the whole dish as the cover", () => {
  const llms = read("llms.txt");
  assert.match(llms, /One picture per step, of that step/);
  assert.match(llms, /Never a collage or grid of several steps in one picture/);
  assert.match(llms, /A photo of the whole dish, or of everything laid out, goes in\n`cover:`/);
});
