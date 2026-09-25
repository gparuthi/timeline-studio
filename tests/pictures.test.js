// Pictures (an event's 6th field, `cover:`) and the routine icons.
// Run: node --test tests/*.test.*
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, render, runConfig, icons } = require("../timeline-renderer.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const noScript = (page) => page.replace(/<script>[\s\S]*<\/script>/, "<script></script>");
const PHOTO = "https://tl.gaup.uk/img/0123456789abcdef.webp";

test("the 6th field is a picture: @asset or an https URL, in both clocks", () => {
  const m = parse(`title: T\nasset plank: ${PHOTO}\n08:00 | Plank | Elbows | | sky | @plank\n09:00 | Run | | | | ${PHOTO}\n10:00 | Rest`);
  assert.deepEqual(
    m.events.map((e) => e.picture),
    ["@plank", PHOTO, ""],
  );
  const r = parse(`title: T\nclock: relative\n+45s | Plank | | | sky | ${PHOTO}`);
  assert.equal(r.events[0].picture, PHOTO);
  // An asset may be defined after the line that uses it.
  assert.equal(parse(`title: T\n08:00 | A | | | | @later\nasset later: ${PHOTO}`).events[0].picture, "@later");
});

test("pictures are checked: https only, the asset must exist, six fields at most", () => {
  assert.throws(() => parse("title: T\n08:00 | A | | | | http://example.com/a.png"), /Line 2: a picture \(the 6th field\) is @asset-name or an https:\/\/ image URL/);
  assert.throws(() => parse("title: T\n08:00 | A | | | | data:image/png;base64,AAAA"), /6th field/);
  assert.throws(() => parse("title: T\n08:00 | A | | | | @nope"), /Line 2: define “asset nope: …” first/);
  assert.throws(() => parse("title: T\n08:00 | A | b | pin | sky | @x | more"), /at most six fields/);
});

test("cover: is an @asset or https URL above the title", () => {
  assert.equal(parse(`title: T\ncover: ${PHOTO}\n08:00 | A`).cover, PHOTO);
  assert.equal(parse(`title: T\ncover: @hero\nasset hero: ${PHOTO}\n08:00 | A`).cover, "@hero");
  assert.throws(() => parse("title: T\ncover: @hero\n08:00 | A"), /The cover names no asset: add “asset hero: …”/);
  assert.throws(() => parse("title: T\ncover: kitchen.jpg\n08:00 | A"), /The cover is @asset-name or an https:\/\/ image URL/);
  assert.throws(() => parse(`title: T\ncover: ${PHOTO}\ncover: ${PHOTO}\n08:00 | A`), /duplicate setting “cover”/);
});

test("a picture renders as a thumbnail link on its card, the cover as a hero above the title", () => {
  const page = render(`title: T\ncover: @hero\nasset hero: ${PHOTO}\nasset plank: https://tl.gaup.uk/img/fedcba9876543210.jpg\n08:00 | Plank | Elbows | | sky | @plank\n09:00 | Rest`);
  assert.match(
    page,
    /<div class="event-body has-pic">.*<h2>Plank<\/h2>.*<a class="pic thumb" href="https:\/\/tl\.gaup\.uk\/img\/fedcba9876543210\.jpg" target="_blank" rel="noopener" aria-label="Photo: Plank"><img src="https:\/\/tl\.gaup\.uk\/img\/fedcba9876543210\.jpg" alt=""><\/a><\/div><\/li>/,
  );
  assert.match(page, /<main class="sheet"><a class="pic cover" href="https:\/\/tl\.gaup\.uk\/img\/0123456789abcdef\.webp"[^>]*><img src="[^"]+" alt=""><\/a><header class="masthead">/);
  // The card without a picture is unchanged.
  assert.match(page, /<div class="event-body"><span class="event-icon"[^>]*>(?:(?!<\/li>).)*<h2>Rest<\/h2>/);
  // A page with pictures carries their styles and the full-screen viewer.
  assert.match(page, /\.pic\.thumb\{/);
  assert.match(page, /function pictureRuntime/);
  // The studio's preview hands a tapped picture to the studio instead.
  assert.doesNotMatch(render(`title: T\n08:00 | A | | | | ${PHOTO}`, { live: true }), /function pictureRuntime/);
  assert.match(render(`title: T\n08:00 | A | | | | ${PHOTO}`, { live: true }), /timeline:picture/);
});

test("pages without pictures carry none of it, and day timelines render as before", () => {
  const page = render(read("example.timeline.txt"));
  assert.doesNotMatch(page, /\.pic\b|pictureRuntime|has-pic/);
  assert.equal(noScript(render(read("example.timeline.txt"))), read("tests/fixtures/example.day.html"));
});

test("the run carries each step's picture URL", () => {
  const { steps } = runConfig(parse(`title: T\nclock: relative\nasset plank: ${PHOTO}\n+45s | Plank | | | | @plank\n+15s | Rest`));
  assert.deepEqual(
    steps.map((s) => s.picture),
    [PHOTO, ""],
  );
  // The run key follows the steps, not their pictures (a photo added
  // during a run keeps it going).
  const without = runConfig(parse("title: T\nclock: relative\n+45s | Plank\n+15s | Rest")).key;
  assert.equal(runConfig(parse(`title: T\nclock: relative\n+45s | Plank | | | | ${PHOTO}\n+15s | Rest`)).key, without);
});

test("workout and kitchen words get an icon instead of the pin", () => {
  const guess = (title, detail = "") => parse(`title: T\nclock: relative\n+45s | ${title} | ${detail}`).events[0].icon;
  const cases = {
    Plank: "dumbbell",
    "Side plank L": "dumbbell",
    Squats: "dumbbell",
    "Dead bug": "dumbbell",
    "Hollow hold": "dumbbell",
    "Mountain climbers": "dumbbell",
    "Jog in place": "run",
    "Jumping jacks": "run",
    "Warm-up": "run",
    Stretch: "stretch",
    "Cool-down": "stretch",
    "Child's pose": "stretch",
    Rest: "timer",
    "Rest and plate": "timer",
    "Boil the pasta": "pot",
    Simmer: "pot",
    Chop: "meal",
    Roast: "meal",
    "Preheat the oven": "meal",
    Bake: "meal",
    "Season the tray": "meal",
  };
  for (const [title, icon] of Object.entries(cases)) assert.equal(guess(title), icon, title);
  // Day words still win where they did.
  assert.equal(guess("Coffee break"), "coffee");
  assert.equal(guess("Lunch break"), "meal");
  assert.equal(guess("Gear run", "@ REI"), "pin");
  for (const name of ["dumbbell", "run", "stretch", "timer", "pot"]) assert.ok(icons.includes(name), name);
  // Every step of the sample routine and recipe now has a fitting icon.
  for (const file of ["example.routine.txt", "example.recipe.txt"])
    for (const e of parse(read(file)).events) assert.notEqual(e.icon, "pin", `${file}: ${e.title}`);
});

test("a page carries only the new icons it uses", () => {
  const page = render("title: T\nclock: relative\n+45s | Plank\n+15s | Rest");
  assert.match(page, /<symbol id="dumbbell"/);
  assert.match(page, /<symbol id="timer"/);
  assert.doesNotMatch(page, /<symbol id="pot"/);
  assert.doesNotMatch(render(read("example.timeline.txt")), /<symbol id="(dumbbell|run|stretch|timer|pot)"/);
  // Written explicitly they work in a day timeline too.
  assert.match(render("title: T\n08:00 | Gym | | dumbbell"), /<symbol id="dumbbell"[\s\S]*<use href="#dumbbell"\/>/);
});

test("the Photo button's text edits: asset names, the 6th field, the cover", () => {
  const { pictureEdits } = require("../timeline-renderer.js");
  const { assetName, withAsset, withPicture, withCover, reusable } = pictureEdits;
  assert.equal(assetName("Side plank L", ""), "side-plank-l");
  assert.equal(assetName("Plank", "asset plank: x\nasset plank-2: y"), "plank-3");
  assert.equal(assetName("20 push-ups", ""), "photo-20-push-ups");
  assert.equal(assetName("Crème brûlée", ""), "creme-brulee");
  assert.equal(assetName("", ""), "photo");
  // Fields are filled in as needed and the line keeps its own spacing.
  assert.equal(withPicture("+45s | Squats", 1, "@squats"), "+45s | Squats | | | | @squats");
  assert.equal(withPicture("+45s  | Plank | Elbows | | sky", 1, "@plank"), "+45s  | Plank | Elbows | | sky | @plank");
  assert.equal(withPicture("+45s | A | | | sky| @old", 1, "@new"), "+45s | A | | | sky | @new");
  assert.equal(withPicture("x\n08:00 | A \\| B | d", 2, "@p"), "x\n08:00 | A \\| B | d | | | @p");
  // Asset lines: replaced in place, else after the last one, else at the end.
  assert.equal(withAsset("title: T\n08:00 | A", "a", "https://x/a.webp"), "title: T\n08:00 | A\n\nasset a: https://x/a.webp\n");
  assert.equal(withAsset("asset a: 1\n08:00 | A", "b", "2"), "asset a: 1\nasset b: 2\n08:00 | A");
  assert.equal(withAsset("asset a: 1\n08:00 | A", "a", "2"), "asset a: 2\n08:00 | A");
  assert.equal(withCover("title: T\n08:00 | A", "@c"), "title: T\ncover: @c\n08:00 | A");
  assert.equal(withCover("title: T\ncover: @old\n08:00 | A", "@c"), "title: T\ncover: @c\n08:00 | A");
  // An asset used by one picture only is reused when that picture changes.
  assert.equal(reusable("08:00 | A | | | | @a\nasset a: 1", "@a"), "a");
  assert.equal(reusable("08:00 | A | | | | @a\n09:00 | B | | @a\nasset a: 1", "@a"), "");
  assert.equal(reusable("08:00 | A | | | | @ab\nasset ab: 1", "@a"), "");
  // Every result still parses.
  const text = withAsset(withPicture("title: T\nclock: relative\n+45s | Squats", 3, "@squats"), "squats", PHOTO);
  assert.equal(parse(text).events[0].picture, "@squats");
});
