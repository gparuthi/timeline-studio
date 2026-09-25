#!/usr/bin/env node
// index.html carries its own copy of timeline-renderer.js (the studio is one
// self-contained file). This rewrites that copy from timeline-renderer.js,
// indented to sit in index.html's <script>, and the help panel's "Try a
// workout" / "Try a recipe" samples (and the New menu's trip) from
// example.routine.txt, example.recipe.txt and example.trip.txt. `--check`
// only reports whether they match (tests/renderer.test.js runs the same
// comparison).
//
//   node scripts/inline-renderer.js          # write index.html
//   node scripts/inline-renderer.js --check  # exit 1 if out of step
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const START = "/* TimelineText: zero-dependency parser + standalone HTML renderer. */";
const END = '})(typeof globalThis !== "undefined" ? globalThis : this);';
const INDENT = "      ";

function indent(source) {
  return source
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => (line ? INDENT + line : line))
    .join("\n");
}

function locate(html) {
  const from = html.indexOf(INDENT + START);
  const to = html.indexOf(INDENT + END, from);
  if (from < 0 || to < 0) throw new Error("index.html: inline renderer block not found");
  return { from, to: to + INDENT.length + END.length };
}

function inlined(html) {
  const { from, to } = locate(html);
  return html.slice(from, to);
}

function expected() {
  return indent(fs.readFileSync(path.join(root, "timeline-renderer.js"), "utf8"));
}

// The samples ride in <script type="application/json" id="sample-…"> blocks.
const SAMPLES = { "sample-workout": "example.routine.txt", "sample-recipe": "example.recipe.txt", "sample-trip": "example.trip.txt" };
const sampleBlock = (id) => new RegExp(`(<script type="application/json" id="${id}">)([\\s\\S]*?)(</script>)`);
function sampleJson(file) {
  return JSON.stringify(fs.readFileSync(path.join(root, file), "utf8")).replace(/</g, "\\u003c");
}
function withSamples(html) {
  for (const [id, file] of Object.entries(SAMPLES)) {
    if (!sampleBlock(id).test(html)) throw new Error(`index.html: ${id} block not found`);
    html = html.replace(sampleBlock(id), (m, open, body, close) => open + sampleJson(file) + close);
  }
  return html;
}
function samplesInStep(html) {
  return Object.entries(SAMPLES).every(([id, file]) => (html.match(sampleBlock(id)) || [])[2] === sampleJson(file));
}

module.exports = { inlined, expected, root, samplesInStep };

if (require.main === module) {
  const file = path.join(root, "index.html");
  const html = fs.readFileSync(file, "utf8");
  const want = expected();
  if (process.argv.includes("--check")) {
    const same = inlined(html) === want && samplesInStep(html);
    console.log(same ? "index.html renderer and samples are in step" : "index.html differs from timeline-renderer.js or the example files");
    process.exit(same ? 0 : 1);
  }
  const { from, to } = locate(html);
  fs.writeFileSync(file, withSamples(html.slice(0, from) + want + html.slice(to)));
  console.log("index.html: inline renderer and samples rewritten from timeline-renderer.js and the example files");
}
