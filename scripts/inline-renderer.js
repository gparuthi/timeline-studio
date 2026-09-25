#!/usr/bin/env node
// index.html carries its own copy of timeline-renderer.js (the studio is one
// self-contained file). This rewrites that copy from timeline-renderer.js,
// indented to sit in index.html's <script>. `--check` only reports whether
// the two match (tests/renderer.test.js runs the same comparison).
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

module.exports = { inlined, expected, root };

if (require.main === module) {
  const file = path.join(root, "index.html");
  const html = fs.readFileSync(file, "utf8");
  const want = expected();
  if (process.argv.includes("--check")) {
    const same = inlined(html) === want;
    console.log(same ? "index.html renderer is in step" : "index.html renderer differs from timeline-renderer.js");
    process.exit(same ? 0 : 1);
  }
  const { from, to } = locate(html);
  fs.writeFileSync(file, html.slice(0, from) + want + html.slice(to));
  console.log("index.html: inline renderer rewritten from timeline-renderer.js");
}
