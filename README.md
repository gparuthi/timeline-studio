# Timeline Studio

Public: https://tl.gaup.uk/ (served by the link Worker as static assets, so the app and its API ship in one deploy on one origin). Source mirror with a GitHub Pages copy: https://gparuthi.github.io/timeline-studio/ (pushed with `publish.sh`). Local: http://md-capture:1250/20260918_timeline-studio/

Open `index.html` in a browser. The timeline is the page; the subtle **✎ Edit** button (bottom right) opens the editor pane with the text, a theme picker, and one **Export** menu (Copy link, Custom link, Image PNG, Timeline HTML, Studio HTML). Tapping a card or a day heading in the preview opens the editor with the cursor at the end of that line; the line is highlighted, because iOS draws no caret (and opens no keyboard) for a focus that did not come from a tap on the text box itself, so tap the highlighted line to start typing. Every action, and the **Done** button, closes the pane again so the timeline is what you see; changes are saved as you type, so there is nothing to cancel. Edit the text to update the preview, choose **Save studio** to keep the editor and your current timeline together in one HTML file, or export a standalone HTML timeline. Saved studio copies reopen with your edits and embedded images, and can be edited and saved again. Linked image URLs remain external. Copy and paste directly in the text editor to move timeline text. The studio includes its renderer and artwork and needs no installation or server.

```text
title: A Day in Los Angeles
date: Saturday, Jun 6, 2026
range: 08:00 - 20:00
theme: travel

08:00 | Coffee and pastries | Neighborhood bakery | coffee | sand
09:30 | Griffith Observatory | Hike up, skip the parking | pin | sky
13:00 | Getty Center | Gardens first, then the galleries | ticket | sand
18:00 | Pier at sunset | Ferris wheel, funnel cake @ Santa Monica Pier | palm | sand

note: Bring your ID
```

Each event is `time | title | description | icon | color | picture`. Only time and title are required. The time can be a span: `15:00 - 17:00`, `3:00 - 5:00 PM` (the start borrows the end's AM/PM), or a start plus a duration such as `15:00 +2h`, `+90m`, `+1h30`. Spans draw a bar along the axis from start to end, the badge reads `3:00–5:00 PM`, and in today mode a spanned event only fades once it has ended. Use empty fields to skip optional values, and `\|` for a literal pipe. Use 24-hour times or explicit AM/PM. Events sort by time; equal-time events retain their source order.

Supported settings: `title`, `date` (display text), `subtitle`, `cover` (a photo above the title, see Images), `range` (per day), `theme`, `footer`, repeatable `note`, repeatable `day`, `header-art`, `timezone` (`timezone: PT`, `ET`, `CET`, `IST`, or an IANA name such as `Asia/Tokyo`; written before any `day:` it covers the whole timeline, under a `day:` it covers that day, for trips that cross zones), `city` (`city: Los Angeles`, added to place searches, see below; global or per day like `timezone`), and `places: off` (stops the studio filling in places for you). The sheet always shows the times as written; the time zone matters to the calendar feed. Whole-line comments start with `#`.

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

## Step notes

Lines starting with `- ` directly under an event line (or under another such line) are that event's notes, for form cues or a step's ingredients. The card shows a small "2 notes ▾" that unfolds them (a `<details>`, so it works in exports without scripts too); tapping elsewhere on the card still opens the editor. A `- ` line anywhere else is an error. The calendar feed and CalDAV append them to the event's description, and a calendar-app move carries them along with their event.

## Routines: workouts and recipes

A routine is a timeline you run from a Start button instead of the clock. Start the first step with its length (`+30s | Jog`) and the text is one: with no `clock:` line, a first event line that begins with a bare `+duration` makes the clock relative (that line was an error before, so no existing text changes meaning). `clock: relative` says it outright, `clock: day` forces a day plan, and `0:30` never infers anything since it could be either clock. The toolbar's **New ▾** opens a starter for each kind (Day plan, Trip, Workout, Recipe: the studio's example on today's date, `example.trip.txt` starting today, `example.routine.txt` and `example.recipe.txt`) as a fresh unsaved page, like the help panel's **Try a workout** and **Try a recipe**; a named timeline is never overwritten.

```text
title: 10-min Core
theme: future

day: Warm-up
+1m   | Jog in place | Easy pace, loose shoulders | | sand

day: Main set
+45s  | Plank | Elbows under shoulders | | sky
- Hips level with shoulders
+15s  | Rest | | | sage
+45s  | Side plank L | Stack your feet | | sky
```

**Format.** Times are elapsed time with second resolution: `5:30` is M:SS, `1:02:03` is H:MM:SS. A duration alone (`+45s`, `+2m`, `+1m30s`, `+1h30`) is a step that starts where the line above it in the source ends (at its start if it has no end), or at 0:00. Spans (`0:00 - 15:00`, `15:00 +25m`) have a fixed start and may overlap, for parallel recipe tracks. `- ` lines are step notes (see above), the 6th field a picture (see Images), and `day:` lines section labels on one continuous clock; `date:`, `range:`, `timezone:` and `city:` are ignored, and places are not filled in for you (an explicit `@ place` still shows). A clock time such as `5:00 PM` in a routine is an error that says to write a length instead.

**The sheet** (`docs/routines.md` §6) has no clock times. At the top is a ready card: the `cover:` photo with the title over it (or a card with the title), the total and counts (`45 min · 6 steps · 2 at once`, or with rests `10 min · 10 moves · 7 rests`), the `note:` lines split on commas into chips you can tick (per device, in localStorage; never written into the text), and a big **Start · 45 min**. Once that Start scrolls out of view a full-width Start docks at the bottom, beside Edit, and the sheet keeps enough bottom padding that it never covers a card. The **✎ Edit** button never floats over a routine's steps: it sits beside the card's Start while that is on screen, beside the docked Start after, in the run bar's controls during a run and beside Restart when it is done (day timelines keep the floating button). Below it the steps run down elapsed lanes: the gutter only marks where something starts (`start`, `at 10 min`, `at 27½ min`); steps that overlap sit side by side, two lanes at most, and a third step running at the same time folds into the second lane as a mini card; a card's height follows its length at 12 px a minute but never drops below what its title, length chip, thumbnail (the picture, or the icon) and "2 notes ▾" need (88 px in a lane, 58 px full width); time where only steps over 15 minutes are running is drawn 15 minutes tall, and such a step gets a zig-zag break carrying its length (`25 min`, `2 h`), placed clear of any moment; rests (a step titled Rest or Break, or given the `timer` icon by hand, without a picture or notes) are 28 px rows; a moment inside a step is a dashed line across it with its title; sections are header rows with their length; the sheet ends with `Done · about 45 min`. The geometry is `routineCore` in `timeline-renderer.js`: the renderer runs it with estimated card heights, so a page opened without scripts is laid out, and the page runs it again with the cards' measured heights whenever notes open or the width changes. Day timelines keep their hour axis; their markup is unchanged.

**Run mode.** Start (the card's, the docked one, in the studio, `view.html` and exported HTML) pins a focus panel over the sheet. The step that ends soonest drives it: its title, picture, description and notes, a countdown bar and `4:00 left of 10 min`; any other live step gets a smaller row of its own with a bar and countdown, and the next step is listed underneath. During a rest the panel counts down "then Side plank L" and shows that move large with its picture. On the sheet finished steps fade, live ones get a green outline and fill up to a "now" line that runs across the lanes behind the cards (so it shows in the gutter and between cards, never through a card's text), a live rest grows to show its countdown, and the page scrolls once each time the live steps change. The bottom bar shows `elapsed 6:00 · left 39:00 · done ≈ 6:15 PM` (the one clock time, and only once a run is going), two labelled switches, **Beeps** and **Announce steps**, each remembered per device (the old cycling sound setting carries over: beeps + voice turns both on, off turns both off), then Back (to the step's start, or the previous step within 3 s of it), Pause/Resume, Skip and Stop, which asks first. Cues: short beeps at 3, 2, 1 s before a step ends and a long beep at each new step (Beeps); "Side plank left, 45 seconds" as each step starts (Announce steps; when two steps are live, the one that started); a vibration at each new step. The screen stays awake while running. At the end: `Done · 10:14` (the time it really took) and Restart. The run is a small state (`startedAt`, `pausedAt`, `pausedMs`, `shiftMs`) from which elapsed time is always computed, never counted, so a locked phone, a background tab or a reload resumes at the right second, and an edit during a run takes effect at once without losing the elapsed time.

**Synced runs.** On a named link (`tl.gaup.uk/<name>`) the run is shared: start it on the phone and a TV with the same link open switches into run mode; pause, skip, back and stop on any device act on all of them, and a page opened or reloaded mid-run joins at the right second. A page connects only while its text is a routine. Unnamed pages and standalone copies (GitHub Pages, `#z=` links, saved files, `view.html`) run locally, with the state in localStorage under a hash of the steps.

How it works: one Durable Object per name (`RunRoom`, `worker/src/runroom.js`, SQLite-backed, WebSockets through the hibernation API) keeps the state and applies ops on the server's clock. `GET /run/<name>` is the socket (the server sends `{ state, now }` on connect and after every change; pages send `{ op: "start" | "pause" | "resume" | "seek" | "stop", shiftMs }` and pings); `GET /run/<name>.json` and `POST /run/<name>` serve a page whose socket is down, which polls every 3 s and reconnects with backoff. Each page estimates its clock skew from the quickest ping round trip, so devices whose clocks disagree still agree on elapsed time, and a socket that stops answering pings is dropped and reopened. In the studio the run lives in the top-level page rather than the preview frame (audio, the wake lock and vibration need it, and the panel and controls must stay put while the iOS-sized preview scrolls); the frame is sent the run's position, and it sends back taps on its own Start, whether that Start has scrolled out of view (an `IntersectionObserver`, which sees through the frame), and ingredient ticks, which the studio stores for it (a sandboxed frame has no storage).

**Writing and changing them.** The command box knows routines ("make rests 20s", "roast 5 minutes longer", "add another plank after the side planks"), turns a day plan into one ("make this a routine", "turn this into a recipe timer" rewrites clock times as `+duration` steps and drops the date), and on an empty editor writes one ("a 15 minute core workout"). `llms.txt` opens with "pick the kind first", so an AI chat asked for a workout or a recipe writes a routine that starts with a `+duration`, with no clock times or date.

**Verify on an iPhone** (headless browsers cannot): beeps and announcements after the first tap (Start, Resume, either sound switch, or **Tap for sound** on a page that joined or resumed without one; in the studio the ready card's own Start is inside the preview frame, so if iOS does not count that tap for the top-level page's audio, the chip appears and one tap on it unlocks sound), the docked Start appearing as the card's Start scrolls away inside the iOS-sized preview, the screen staying on, the camera/library picker behind **Photo**, and a phone and a second device following the same run. Vibration does not exist on iOS Safari.

## Themes

`theme:` picks a look: `travel` (default, with the header art), `minimal`, `retro`, `future`, or `code`. The studio's toolbar picker writes that line for you. `travel` and `minimal` follow the system appearance: the same text is a light sheet by day and a dark one when the phone switches to dark mode at night (screen only; printing stays light, and a shared image takes whichever the device shows at the time). `future` and `code` are always dark, `retro` keeps its sun. See them side by side at `themes.html`; each card there has a "Use in studio" link. Themes are plain CSS blocks in `timeline-renderer.js` (`themes`), layered over the base sheet, so adding one is adding a string.

## Links

On https://tl.gaup.uk/ the address is the timeline. A fresh page gets its own link on your first edit (`tl.gaup.uk/a-day-in-los-angeles-k3x9p`: the title plus a random tail), and from then on every edit saves there about a second and a half after you stop typing, so the address never changes and whoever has it always sees the latest version. **Export → Copy link** copies that address; **Export → Custom link…** makes a copy under a name you choose (`tl.gaup.uk/la-week`) and takes you there. Anyone with the link can edit it, like a shared document: a made-up name is unguessable, a chosen one is as guessable as you make it. The pane shows the saving state under the toolbar at all times ("Saved · 9:41 PM", "Saving…", or a red warning that the edits are not saved, which you tap to fix: save yours over a version changed elsewhere, or retry), and **Done** saves at once and reports. An open page also checks its document every 15 seconds while visible, and whenever you come back to it, and takes a newer version from another device or the calendar app when it has no unsaved edits of its own ("Updated from another device"). Text is stored in Workers KV with no expiry, and nothing else is sent anywhere. Older `tl.gaup.uk/<id>` snapshot links still open; editing one starts a new named timeline.

The GitHub Pages copy (https://gparuthi.github.io/timeline-studio/) and saved studio files are standalone: there the text rides in the address bar (`index.html#z=…`, deflate-compressed and base64url, updated as you type), **Copy link** copies that long link, and `view.html#z=…` shows it on a bare viewer page. Nothing in those links is sent to a server, but embedded images inflate them and some messengers refuse links past roughly 30k characters, so prefer **Export → Timeline (HTML)** for image-heavy days.

**Staying current.** Every page is stamped with the app version it was served with (a hash of the deployed studio page), and `GET /version` returns the version live now. An open page, including a Home Screen app that iOS resumes rather than reloads, checks on start, whenever it comes back to the foreground, and every few minutes while visible. When a newer version is out it reloads itself if nothing is unsaved and the editor is closed; otherwise a toast offers Reload. The help panel (**?**) shows the version and when it was last checked.

## Calendar feed

**Export → Calendar feed** copies the timeline's address with `.ics` on the end (`https://tl.gaup.uk/la-week.ics`). Subscribe to it in Google Calendar (Other calendars → **From URL**) or in iOS Calendar (Add Subscription Calendar) and every event of every dated day appears as a calendar event that follows your edits. The feed is generated from the text on each request: each event is a UTC instant converted from the written time in the timeline's `timezone:` (a day's own `timezone:` wins; Pacific when none is given), because Google Calendar reads zone-less times as UTC; a span keeps its end, any other event lasts an hour or until the next one, the description becomes the event description, the place before a map link becomes the location, and the link becomes the event URL. Undated days are skipped, so a routine (`clock: relative`) is an empty calendar; its CalDAV calendar is empty and read-only too. Google polls subscribed URLs on its own schedule, typically every several hours and up to a day; iOS lets you choose the refresh interval in the calendar's settings, so the phone is the faster way to follow edits. To edit from a calendar app, use CalDAV below instead.

## Edit from a calendar app (CalDAV)

A timeline is also a CalDAV calendar, so a calendar app can move, rename, add and delete its events and the text follows. On an iPhone or Mac, **Export → Add to Calendar app** (or the link `https://tl.gaup.uk/la-week.mobileconfig`) downloads a configuration profile with the account filled in: install it from Settings → Profile Downloaded (unsigned, so iOS says so) and the calendar appears. By hand, or on other apps: Settings → Calendar → Accounts → Add Account → Other → **Add CalDAV Account**, server `tl.gaup.uk`, user name the link's name (`la-week`), password anything (the name is the key, as it is for the link). macOS Calendar, Thunderbird and DAVx5 on Android take the same details; the account URL, if asked, is `https://tl.gaup.uk/dav/la-week/`. Google Calendar cannot use outside CalDAV servers and keeps the read-only feed above.

Dragging an event rewrites that line's time (and its day when it crosses one; a day not yet on the sheet is added in date order); changing the length writes a `HH:MM - HH:MM` span; renaming changes the title; a new event becomes a new line under its day with the calendar's description or location as its description; deleting removes the line. Icons, colours and everything else on the line stay as written. Each event's id comes from its title, so a move keeps its identity, and the address a calendar app created an event under keeps working after renames. Every change saves the timeline, which an open studio tab then sees as "changed elsewhere". Implemented in `worker/src/caldav.js`: OPTIONS, PROPFIND, REPORT (calendar-query, calendar-multiget), GET, PUT, DELETE, HTTP Basic auth; no sync-collection, clients use ctag and etags.

## Change it in plain words

The box at the top of the editor pane takes an instruction instead of an edit: `move golf to 3 pm`, `add lunch with Priya at 12:30 on Wednesday at the airport`, `push everything on Monday back by one hour`, `I'll skip SF on Thursday`. The studio posts the text and the instruction to the link server (`POST /command` with `{ text, command, today }`), which asks Workers AI (`@cf/qwen/qwen3-30b-a3b-fp8`, reasoning on) for the complete edited text and returns `{ text, note }`. The whole document goes both ways because a timeline is a few hundred tokens, and a full text is far easier to validate than a diff: the studio parses the answer, applies it only if it is still a timeline, puts the cursor on the first changed line, and shows "N lines changed · Undo" (the previous text is kept; on a Mac, Cmd+Z works too). A question or an instruction that cannot be applied comes back unchanged with the model's note in the status line. "Today" and "tomorrow" resolve against the date the studio sends, and a bare time follows the event (dinner at 7:30 is 19:30). Embedded images are stripped before the model sees the text and put back afterwards. A command costs about 25 neurons against Workers AI's free 10,000 a day, takes 3–13 seconds, and the Worker rate-limits it to 20 a minute per address so a stranger cannot spend the allowance. Like short links, this sends the timeline off your device; nothing is stored. Local dev: `wrangler dev` (without `--local`) runs the AI binding remotely.

## Use it from ChatGPT or Claude

Timeline Studio is also an MCP connector: add it once and a chat can be asked "make me a recipe timeline for sheet-pan chicken" or "move my 6 AM workout's rests to 20 seconds". It writes the text, the server checks it, saves it under a short link and hands the link back, and the chat can keep editing the same timeline or start and stop a routine's run on every open phone. The address is **`https://tl.gaup.uk/mcp`**, with no sign-in (the same model as the links: a name is the key). The help panel (**?** → Write one with ChatGPT or Claude) shows it with a Copy button.

- **ChatGPT** (web, a plan with developer mode): Settings → Apps & Connectors → Advanced settings → turn on **Developer mode** (it has also lived under Settings → Security). Back in Apps & Connectors, **Create**: name `Timeline Studio`, MCP server URL `https://tl.gaup.uk/mcp`, Authentication **No authentication**, tick "I trust this application", Create. It lists five tools. In a chat, open **+** → Developer mode and turn on Timeline Studio. ChatGPT asks before each call that saves (create, update, run); "remember for this conversation" stops that.
- **Claude** (claude.ai or the desktop app): Settings → Connectors → **Add custom connector**, name `Timeline Studio`, URL `https://tl.gaup.uk/mcp`, leave the OAuth fields empty, Add. In a chat, turn it on from the tools (search and tools) menu. On Team and Enterprise plans an owner adds it under Organization settings first.

The tools: `format_guide(kind?)` returns the format rules and a worked example for a `day`, `trip`, `workout` or `recipe`, cut from `llms.txt` at runtime (its sections for that kind, without "What to send back"), so there is one description of the format. `create_timeline(text, name?)` parses the text with the renderer and refuses it with the parser's own message ("Line 7: …") if it would not open; it saves under the name if that is free, otherwise under the title plus a random tail as the studio does, and never overwrites. `get_timeline(name)` returns the text and its version; `update_timeline(name, text, version?)` replaces the text of an existing timeline and, if `version` is stale because someone edited it since, refuses and returns the current text so the model can redo its change. `control_run(name, op)` sends `start`, `pause`, `resume` or `stop` to a routine's RunRoom (the same room as `POST /run/<name>`) or reads its `status`: state, elapsed, the current step and the next. Names can be given as `la-week` or as `https://tl.gaup.uk/la-week`. Every result carries `structuredContent` and a text block with a Markdown link. Text is limited to 100 KB, `data:` image URIs are refused (a picture is an `https://` URL; uploading a photo stays a studio action), and `POST /mcp` is rate-limited to 60 requests a minute per address (the `MCP` ratelimit binding).

The server (`worker/src/mcp.js`) is stateless Streamable HTTP with no SDK: `POST /mcp` takes one JSON-RPC message or a batch and answers `application/json`; `GET` and `DELETE` get 405; there is no SSE stream and no session id. It answers `initialize` (echoing a requested version it speaks, 2024-11-05 to 2025-11-25, else 2025-11-25, with the short rules as `instructions`), `notifications/initialized` (202), `ping`, `tools/list` and `tools/call`, and serves 2026-07-28 clients per request (`server/discover`, the version in each request's `_meta`). Check it with `curl -s https://tl.gaup.uk/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` or the MCP Inspector (`npx @modelcontextprotocol/inspector --cli https://tl.gaup.uk/mcp --transport http --method tools/list`). Design: `docs/mcp.md`.

## Write one with any AI chat

`llms.txt` (served at https://tl.gaup.uk/llms.txt) is a help page written for an LLM: the format, icons, colours, settings, worked examples of a day, a trip, a workout and a recipe, the rule that pictures are real `https://` image URLs (never invented), and what to send back. Start a chat in ChatGPT, Claude or anything that can read a URL with `Read https://tl.gaup.uk/llms.txt and make me a timeline:` plus the plan. The model answers with the text in a code block and a link of the form `https://tl.gaup.uk/#text=<percent-encoded text>`; `#text=` is plain `encodeURIComponent` text so a model can write it without running code (the studio's own `#z=`/`#t=` links need deflate and base64). Opening it loads the timeline without saving, as any fragment link does; the first edit gives it a name. Keep `llms.txt` in step with the format when the format changes: the connector's `format_guide` is cut from it. Its top tells a chat that has the connector to use it instead of building a link. The in-app help (**?**) points to it.

## Links and maps

**A place needs no link.** End a description with ` @ ` and the place, `Gear run @ REI Baldwin Hills` or just `@ Wi Spa`, and the card shows a pin chip with that name. A bare `@` means the title is the place: `Manhattan Beach | @`, or `Getty Center | Gardens first @`. Tapping it opens Google Maps searching for the place (`google.com/maps/search/?api=1&query=…`), so Google resolves the name when the link is opened and nothing is looked up in advance: no API key, no address to paste, and it works in the standalone copy too. A `city: Los Angeles` line is appended to every search (`REI Baldwin Hills, Los Angeles`) so short names land in the right town; put one under a `day:` for a trip that moves. The calendar feed and CalDAV use the place as the event's location and the search as its URL, and an event created in a calendar app with a location comes back as `@ place`. The command box knows the form too: "add REI Baldwin Hills to the gear run" writes it. An email address is not a place: the `@` must follow a space.

**Places are filled in for you.** A few seconds after you stop typing, and once when you open a saved timeline, the studio sends the text to the link server (`POST /places`), which shows Workers AI each day's events as numbered lines and asks which of the unplaced ones name a venue; the answer is a short list of line numbers and place names. `Golf with Dimitri | Griffith Park golf course` gains `@ Griffith Park Golf Course`, `wii spa` gains `@ Wi Spa`, `Manhattan Beach` gains `@ Manhattan Beach`, and `reach airport` gains `@ LAX` when a flight on that day names it, while `breakfast`, `Drive home`, `Return the car` or `start for Rajan's` stay as they are. The server accepts only that one shape of change, on lines that had neither a place nor a link, and only a place made of that line's own words (a misspelling corrected, a generic word such as "Center" or "Beach" added; a generic line such as "reach airport" may take a name from its own day), never a placeholder or a lone possessive, so a wrong answer can at most miss a place, never invent one or rewrite the day. The toast names what was added and offers Undo; lines it has looked at are remembered per timeline in the browser, so it never asks about the same line twice. `places: off` in the text turns it off. On a real week it found ten of the twenty unplaced events in two identical runs, with nothing wrong.

URLs in a description or note are clickable in every output. A Google or Apple Maps link (including the short `maps.app.goo.gl` form) renders as a small pin chip labelled "Map" so the text around it stays readable; any other link shows its host name. Paste a map short link on its own as a description and the studio fills in the place before it, `REI · 1900 Empire Ave, Burbank, CA 91504 · https://maps.app.goo.gl/…`, by asking the link server to follow the redirect (`GET /resolve?u=…`, map hosts only, the browser cannot follow it cross-origin). The rewrite happens once; edit the text afterwards and it stays yours. Tapping a link in a shared view opens it rather than the editor.

## Share image

**Export → Image (PNG)** rasterizes the timeline (720px wide, 2x) with the vendored html2canvas and hands the PNG to the system share sheet, so on a phone it goes straight into Messages; where sharing files isn't available it downloads instead. Card gradients flatten to their base tint and offset shadows are dropped in the image, since html2canvas cannot draw them. Saved studio copies need `vendor/html2canvas.min.js` beside them for this button.

## Today

If the `date:` line is today (parsed from `2026-06-06`, `Jun 6, 2026`, `6 Jun 2026`, or `6/6/2026`), the rendered timeline goes live: past cards fade, a slowly blinking marker sits at the current minute on the axis, the next card shows "in 25 min", and the page opens scrolled so that the marker sits one hour of the scale below the top of the screen, the last hour still in view. Days that are already over collapse behind a "Show N earlier days" button at the top of the sheet (unless every day is over), so the page starts at today. When the current minute is outside the day's hours, or today is not on the sheet, the page opens on the next scheduled event instead (later today, or the first event of the next day); when every dated day is already over, it opens at the bottom. Undated timelines open at the top. Refreshes every 30 seconds and whenever the tab becomes visible. On any other day nothing changes.

Built-in icons: `home`, `plane`, `depart`, `land`, `coffee`, `meal`, `tree`, `bed`, `shop`, `ticket`, `pin`, `car`, `road`, `palm`, and for routines `dumbbell`, `run`, `stretch`, `timer`, `pot`. Leave the icon field empty and one is guessed from the title or description (breakfast/lunch/dinner → `meal`, coffee/bakery → `coffee`, park/playground/hike → `tree`, hotel/check in → `bed`, market/shopping → `shop`, museum/observatory/show → `ticket`, beach/pier → `palm`, flight → `plane`, departs → `depart`, lands → `land`, drive/car → `car`; then workout and kitchen words: plank/squat/crunch → `dumbbell`, jog/warm-up → `run`, stretch/yoga/cool-down → `stretch`, rest/hold → `timer`, boil/simmer/stir → `pot`, chop/roast/bake/preheat → `meal`; otherwise `pin`); an explicit icon always wins. A page carries only the routine icons it uses, so a day timeline's markup is unchanged by them. Colors: `sky`, `sand`, `sage`.

The optional range has whole-hour boundaries within one calendar day. Without it, the renderer fits the range to the events. Every hour occupies the same vertical distance. Dots mark exact times, while cards shift to avoid overlaps. Dense timelines grow vertically to keep every card visible.

## Images

An image is an asset line (`asset hotel: <url>`) used by name. It can be an event's **picture** (the 6th field, shown as a 64px thumbnail on the right of the card; tapping it opens it full screen, tapping elsewhere still opens the editor), a **cover** (`cover: @hotel`, a full-width photo above the title), an event's icon, or the header artwork. The 6th field and `cover:` also take an `https://` image URL directly. In run mode the live step's picture is shown large in the focus panel and the next step's as a thumbnail.

```text
asset hotel: https://example.com/hotel.png
cover: @hotel
16:00 | Hotel check-in | Ocean view | | sage | @hotel
```

The example URL is a placeholder. **Adding a photo:** tap a card, then **Photo** beside the highlighted line (on a phone this offers the camera or the library); tap the title for **Cover**. The image is shrunk in the browser to at most 1280px on the long edge (WebP, JPEG where the browser cannot write WebP, aiming for 400 KB) and, on tl.gaup.uk, uploaded (`POST /img`), so the text carries a short `https://tl.gaup.uk/img/<hash>.webp` link instead of megabytes of base64; the asset is named after the step (`plank`, `plank-2`, …) and a photo replaced later reuses its asset. “Add your own images” in the help panel goes the same way. Standalone copies (GitHub Pages, saved studio files) have no server and embed the shrunk image as a `data:` URI, which works offline but makes links long.

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

**The studio carries its own copy.** `index.html` inlines `timeline-renderer.js` so a saved studio file is self-contained. Edit `timeline-renderer.js`, then run `node scripts/inline-renderer.js` to rewrite the inline copy. `node --test tests/*.test.*` (no dependencies) checks that the two copies are identical and parse and render every sample the same, pins the day-timeline markup against snapshots in `tests/fixtures/`, and covers the relative clock and its inference, the routine sheet's geometry (lanes, folding, long steps, minimum heights, the ready card's counts and chips), step notes, the run arithmetic and CalDAV's handling of step notes.

This is a small custom format inspired by Mermaid's text-to-diagram workflow; it is not Mermaid syntax. The exported HTML contains the event content and uses JavaScript to position cards and connectors; the export also bakes the computed layout into inline styles so viewers that run no scripts (iOS Files/QuickLook, mail previews) still show every card. It is responsive, with no fixed one-page print guarantee for long timelines.

## On a phone

The studio ships app-mode metadata (`manifest.webmanifest`, `apple-touch-icon.png`, `maximum-scale=1`, 16px controls on touch screens) so it can be added to the home screen and does not zoom when the editor is focused. The preview relays its scroll-to-now to the studio because iOS sizes iframes to their content.


When the keyboard is up, the editor pane is sized to the visible part of the screen (`visualViewport`), so the text you are typing stays above the keys and the caret line is scrolled into view; Android gets the same via `interactive-widget=resizes-content`.
## Local preview

Open `index.html` directly, or run `python3 -m http.server 8766` from this directory. The standalone studio requires no build or installation.

## Publishing

The app is served at https://tl.gaup.uk/ by the Worker in `worker/` (`src/index.js`: documents in the `LINKS` KV namespace under `doc:<name>`, the studio page with the document inlined, `/resolve`, `/command`, feeds, pictures; `src/caldav.js`: CalDAV). **Pictures** are stored in the same KV namespace under `img:<first 16 hex of the sha256>` with their type in metadata, no expiry: `POST /img` takes the bytes (refused over 1.5 MB, or unless the bytes are PNG, JPEG, WebP or GIF, never SVG), is rate-limited to 30 a minute per address (the `IMAGES` ratelimit binding), and answers `{ url }`; `GET /img/<hash>.<ext>` serves it with `Cache-Control: public, max-age=31536000, immutable`. `wrangler.jsonc` declares this folder as its static assets (`.assetsignore` keeps `worker/`, `tests/`, `scripts/`, the README and the publish script out), so `cd worker && npx -y wrangler@latest deploy` ships the studio, the viewer, the renderer and the API together. `wrangler dev` run from `worker/` reloads in a loop, because its own `worker/.wrangler/tmp` writes land inside the assets folder it watches; run it from a copy of `wrangler.jsonc` in another folder with `main` and `assets.directory` rewritten to absolute paths, and its state stays out of the watched tree. Link names that would shadow a file or an endpoint (`view`, `themes`, `command`, `img`, `run`, `mcp`, …) are refused. The separate public repo `gparuthi/timeline-studio` (GitHub Pages from `main`) is a source mirror: `publish.sh` copies the web files and `worker/` over and pushes. It carries the same sample data as here, so keep the sample free of anything private.

The editor uses the playground dark theme; rendered timelines retain their paper palette. Save studio downloads a new editable `.studio.html` copy.
