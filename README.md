# Timeline Studio

Public: https://gparuthi.github.io/timeline-studio/ (a mirror of this folder, pushed with `publish.sh`). Local: http://md-capture:1250/20260918_timeline-studio/

Open `index.html` in a browser. The timeline is the page; the subtle **✎ Edit** button (bottom right) opens the editor pane with the text, a theme picker, **Copy link**, and one **Export** menu (Image PNG, Timeline HTML, Studio HTML). Every action closes the pane again so the timeline is what you see. Edit the text to update the preview, choose **Save studio** to keep the editor and your current timeline together in one HTML file, or export a standalone HTML timeline. Saved studio copies reopen with your edits and embedded images, and can be edited and saved again. Linked image URLs remain external. Copy and paste directly in the text editor to move timeline text. The studio includes its renderer and artwork and needs no installation or server.

```text
title: A Day in Los Angeles
date: Saturday, Jun 6, 2026
range: 08:00 - 20:00
theme: travel

08:00 | Coffee and pastries | Neighborhood bakery | coffee | sand
09:30 | Griffith Observatory | Hike up, skip the parking | pin | sky
13:00 | Getty Center | Gardens first, then the galleries | ticket | sand
18:00 | Pier at sunset | Ferris wheel, funnel cake | palm | sand

note: Bring your ID
```

Each event is `time | title | description | icon | color`. Only time and title are required. Use empty fields to skip optional values, and `\|` for a literal pipe. Use 24-hour times or explicit AM/PM. Events sort by time; equal-time events retain their source order.

Supported settings: `title`, `date` (display text), `subtitle`, `range` (per day), `theme`, `footer`, repeatable `note`, repeatable `day`, and `header-art`. Whole-line comments start with `#`.

## Several days

Start each day with a `day:` line; the events, `range:` and `note:` lines under it belong to that day. Everything before the first `day:` is the first day, so a one-day timeline needs no `day:` at all.

```text
title: Long Weekend
theme: travel

day: Saturday, Jun 6, 2026
range: 08:00 - 16:00
08:30 | Leave for the airport | Bags by the door | plane | sky
16:00 | Hotel check-in | Downtown | home | sage
note: Check-in starts at 4 PM

day: Sunday, Jun 7
09:00 | Breakfast | Waterfront cafe | coffee | sand
15:30 | Beach | Bring towels | palm | sage
```

Each day gets its own heading, hour scale and notes on the same sheet. Without a `date:` line the masthead shows the span (`Jun 6 – Jun 8, 2026`) when the day labels parse as dates. Notes written before any `day:` line are global and appear after the last day. Today mode works per day: days already over fade entirely, today's day carries the marker, later days are untouched.

## Themes

`theme:` picks a look: `travel` (default, with the header art), `minimal`, `retro`, `future`, or `code`. The studio's toolbar picker writes that line for you. See them side by side at `themes.html`; each card there has a "Use in studio" link. Themes are plain CSS blocks in `timeline-renderer.js` (`themes`), layered over the base sheet, so adding one is adding a string.

## Share links

Once you edit, the studio's own address bar carries the timeline too (`index.html#z=…`, updated as you type via `history.replaceState`), so copying the browser URL is enough to share; whoever opens it sees the timeline with the editor tucked away. **Copy link** puts the whole timeline text into the URL fragment of `view.html` (on plain http, where the clipboard API is missing, Copy link falls back to a selection copy, then to a dialog showing the link) (deflate-compressed, base64url; `#z=…`, or `#t=…` uncompressed in browsers without CompressionStream). Nothing is sent to a server: the fragment never leaves the browser, and `view.html` is a static page that decodes and renders it. The viewer's footer links back to the studio with the same fragment, so anyone with the link can edit a copy. Embedded images inflate links; past roughly 30k characters some browsers refuse them, so prefer **Export → Timeline (HTML)** for image-heavy days.

## Share image

**Export → Image (PNG)** rasterizes the timeline (720px wide, 2x) with the vendored html2canvas and hands the PNG to the system share sheet, so on a phone it goes straight into Messages; where sharing files isn't available it downloads instead. Card gradients flatten to their base tint and offset shadows are dropped in the image, since html2canvas cannot draw them. Saved studio copies need `vendor/html2canvas.min.js` beside them for this button.

## Today

If the `date:` line is today (parsed from `2026-06-06`, `Jun 6, 2026`, `6 Jun 2026`, or `6/6/2026`), the rendered timeline goes live: past cards fade, a slowly blinking marker sits at the current minute on the axis, the next card shows "in 25 min", and the page opens scrolled to now. Refreshes every 30 seconds and whenever the tab becomes visible. On any other day nothing changes.

Built-in icons: `home`, `plane`, `depart`, `land`, `coffee`, `ticket`, `pin`, `car`, `road`, `palm`. Colors: `sky`, `sand`, `sage`.

The optional range has whole-hour boundaries within one calendar day. Without it, the renderer fits the range to the events. Every hour occupies the same vertical distance. Dots mark exact times, while cards shift to avoid overlaps. Dense timelines grow vertically to keep every card visible.

## Images

Use “Add your own images” in the studio to embed an image into the source text. Embedded images stay with both the saved text and exported HTML. An image can replace an event icon or the header artwork:

```text
asset hotel: https://example.com/hotel.png
header-art: @hotel
16:00 | Hotel check-in | Ocean view | @hotel | sage
```

The example URL is a placeholder. Linked images require a network connection. Uploaded images are embedded and work offline.

## Reuse the renderer

`timeline-renderer.js` is also available separately. No dependencies or build step are required. In a browser, it exposes `TimelineText.parse(source)` and `TimelineText.render(source)`. `render` returns a complete HTML document; put it in an iframe’s `srcdoc`, or save it as an HTML file.

```html
<script src="timeline-renderer.js"></script>
<iframe id="timeline" title="Timeline" sandbox="allow-scripts"></iframe>
<script>
  const source = "08:00 | Coffee and pastries\n09:30 | Observatory";
  document.querySelector("#timeline").srcdoc = TimelineText.render(source);
</script>
```

In Node:

```js
const fs = require("node:fs");
const { render } = require("./timeline-renderer.js");
const source = fs.readFileSync("example.timeline.txt", "utf8");
fs.writeFileSync("trip.html", render(source));
```

This is a small custom format inspired by Mermaid's text-to-diagram workflow; it is not Mermaid syntax. The exported HTML contains the event content and uses JavaScript to position cards and connectors; the export also bakes the computed layout into inline styles so viewers that run no scripts (iOS Files/QuickLook, mail previews) still show every card. It is responsive, with no fixed one-page print guarantee for long timelines.

## On a phone

The studio ships app-mode metadata (`manifest.webmanifest`, `apple-touch-icon.png`, `maximum-scale=1`, 16px controls on touch screens) so it can be added to the home screen and does not zoom when the editor is focused. The preview relays its scroll-to-now to the studio because iOS sizes iframes to their content.

## Local preview

Open `index.html` directly, or run `python3 -m http.server 8766` from this directory. The standalone studio requires no build or installation.

## Publishing

The public copy lives in the separate public repo `gparuthi/timeline-studio` (GitHub Pages from `main`). This folder is the source; `publish.sh` copies the web files over and pushes. The public repo carries the same sample data as here, so keep the sample free of anything private.

The editor uses the playground dark theme; rendered timelines retain their paper palette. Save studio downloads a new editable `.studio.html` copy.
