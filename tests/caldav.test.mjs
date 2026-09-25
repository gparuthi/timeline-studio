// CalDAV edits keep an event's "- " step notes with it, and the calendar
// description carries them. Run: node --test tests/*.test.*
import test from "node:test";
import assert from "node:assert/strict";
import TimelineText from "../timeline-renderer.js";
import { applyEvent, eventObjects, parseEvent } from "../worker/src/caldav.js";

const text = `title: Trip
day: Saturday, Jun 6, 2026
08:00 | Run | Easy loop
- Water at the halfway bench
- Stretch after
10:00 | Brunch

day: Sunday, Jun 7, 2026
09:00 | Swim
- Bring goggles
`;
const ics = (day, hhmm, summary) =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:202606${day}T${hhmm}00\r\nDTEND:202606${day}T${String(Number(hhmm.slice(0, 2)) + 1).padStart(2, "0")}${hhmm.slice(2)}00\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const events = () => eventObjects(TimelineText.parse(text), "trip", "/dav/trip/cal/");
const find = (title) => events().find((e) => e.event.title === title);

test("the calendar description carries the step notes", () => {
  assert.match(find("Run").ics, /DESCRIPTION:Easy loop\\n- Water at the halfway bench\\n- Stretch after/);
  assert.match(find("Swim").ics, /DESCRIPTION:- Bring goggles/);
});

test("a move within the day rewrites only the event line", () => {
  const next = applyEvent(text, TimelineText.parse(text), find("Run"), parseEvent(ics("06", "0730", "Morning run")));
  assert.match(next, /07:30 \| Morning run \| Easy loop\n- Water at the halfway bench\n- Stretch after\n10:00 \| Brunch/);
  assert.deepEqual(TimelineText.parse(next).events[0].notes, ["Water at the halfway bench", "Stretch after"]);
});

test("a move to another day takes the notes along", () => {
  const next = applyEvent(text, TimelineText.parse(text), find("Run"), parseEvent(ics("07", "1100", "Run")));
  const model = TimelineText.parse(next);
  assert.deepEqual(
    model.days.map((d) => d.events.map((e) => [e.title, e.notes])),
    [
      [["Brunch", []]],
      [
        ["Swim", ["Bring goggles"]],
        ["Run", ["Water at the halfway bench", "Stretch after"]],
      ],
    ],
  );
});

test("a new event lands after the notes of the event before it", () => {
  const next = applyEvent(text, TimelineText.parse(text), null, parseEvent(ics("06", "0900", "Coffee")));
  const model = TimelineText.parse(next);
  assert.deepEqual(
    model.days[0].events.map((e) => [e.title, e.notes]),
    [
      ["Run", ["Water at the halfway bench", "Stretch after"]],
      ["Coffee", []],
      ["Brunch", []],
    ],
  );
});

test("an event that leaves its day takes the day line and its notes", () => {
  const next = applyEvent(text, TimelineText.parse(text), find("Swim"), parseEvent(ics("06", "1200", "Swim")));
  const model = TimelineText.parse(next);
  assert.equal(model.days.length, 1);
  assert.deepEqual(model.days[0].events.at(-1).notes, ["Bring goggles"]);
});
