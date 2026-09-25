// The renderer exists twice: timeline-renderer.js and the copy inlined in
// index.html. These checks keep the two in step and pin the day-timeline
// output. Run: node --test tests/*.test.js   (or node tests/renderer.test.js)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { inlined, expected } = require("../scripts/inline-renderer.js");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fileCopy = require("../timeline-renderer.js");
const html = read("index.html");
// Evaluate index.html's copy the way node loads the file: it exports through
// `module` when there is one.
const inlineCopy = (() => {
  const module = { exports: {} };
  new Function("module", inlined(html))(module);
  return module.exports;
})();

const samples = {
  "example.timeline.txt": read("example.timeline.txt"),
  "example.routine.txt": read("example.routine.txt"),
  "example.recipe.txt": read("example.recipe.txt"),
  "multiday.timeline.txt": read("tests/fixtures/multiday.timeline.txt"),
  "short.routine.txt": read("tests/fixtures/short.routine.txt"),
  "studio example": JSON.parse(html.match(/<script type="application\/json" id="studio-source">([\s\S]*?)<\/script>/)[1]).replace(
    "{{today}}",
    "Saturday, Jun 6, 2026",
  ),
};
// index.html indents its copy, so function sources and multi-line template
// literals carry extra leading spaces; compare with those removed.
const flat = (text) => text.replace(/\n[ \t]+/g, "\n");
const noScript = (page) => page.replace(/<script>[\s\S]*<\/script>/, "<script></script>");

test("index.html inlines exactly timeline-renderer.js", () => {
  assert.equal(inlined(html), expected(), "run: node scripts/inline-renderer.js");
});

for (const [name, text] of Object.entries(samples)) {
  test(`both copies parse ${name} identically`, () => {
    assert.deepEqual(JSON.parse(JSON.stringify(inlineCopy.parse(text))), JSON.parse(JSON.stringify(fileCopy.parse(text))));
  });
  test(`both copies render ${name} identically`, () => {
    for (const live of [false, true])
      assert.equal(flat(inlineCopy.render(text, { live })), flat(fileCopy.render(text, { live })));
  });
}

test("the rendered scripts parse", () => {
  for (const text of Object.values(samples))
    for (const live of [false, true]) {
      const page = fileCopy.render(text, { live });
      assert.doesNotThrow(() => new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]));
    }
});

test("day timelines render exactly as before routines (markup and styles)", () => {
  assert.equal(noScript(fileCopy.render(samples["example.timeline.txt"])), read("tests/fixtures/example.day.html"));
  assert.equal(noScript(fileCopy.render(samples["multiday.timeline.txt"])), read("tests/fixtures/multiday.day.html"));
});

test("only relative timelines carry run mode", () => {
  assert.doesNotMatch(fileCopy.render(samples["example.timeline.txt"]), /runRuntime/);
  assert.match(fileCopy.render(samples["example.routine.txt"]), /function runRuntime/);
  // The studio runs it from the top-level page, not inside the preview.
  assert.doesNotMatch(fileCopy.render(samples["example.routine.txt"], { live: true }), /function runRuntime/);
});

// publish.sh lives only in the playground folder, not in the public mirror.
test("the example files are in publish.sh's copy list", { skip: !fs.existsSync(path.join(root, "publish.sh")) && "no publish.sh here" }, () => {
  const publish = read("publish.sh");
  for (const file of ["example.timeline.txt", "example.routine.txt", "example.recipe.txt"]) assert.match(publish, new RegExp(file.replace(".", "\\.")));
});
