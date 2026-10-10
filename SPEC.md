# Personal Dashboard — Spec

One place for all ongoing life and professional projects: status, progress,
deadlines, a weekly bullet-journal plan with hours per day, and (later) a
two-way Google Calendar integration. Primary user: a working SWE-SRE who also
studies CS and accumulates a backlog of lectures and projects.

Status: **decisions from the initial grilling session (2026-10-10).** v1 (the local
UI) is implemented; see README.md.

## 1. Architecture

| Decision | Choice |
|---|---|
| Hosting | Static site on GitHub Pages, no backend. |
| Storage (v1) | Browser storage (IndexedDB) behind a `Storage` interface, with JSON export/import. |
| Storage (v2) | Same interface, backed by a JSON file in the user's Google Drive (`drive.file` scope — the app sees only files it creates). |
| Auth (v2) | Google sign-in with an OAuth Client ID from a GCP project the user owns, in "testing" mode. One login covers Drive and Calendar. |
| Devices | Desktop-first, phone usable. The week grid targets laptop/desktop; on narrow screens it collapses to a single-day/list view for quick check-offs. Installable as a PWA. |
| Stack | React + TypeScript + Vite, Tailwind CSS, dnd-kit (drag and drop), Zustand (state). Open to revisiting. |
| Visual style | Dense, dark-first dev-tool look (Linear/Grafana-like): compact, monospace accents. |

## 2. Data model

```
Area            e.g. University, Work, Personal, Side projects
 └─ Project     e.g. "Operating Systems (course)", "Homelab migration"
     ├─ overviewDoc   markdown: goals, links, decisions (one living doc)
     ├─ log[]         timestamped progress entries ("2026-10-10: finished part 2")
     ├─ progressMode  'checklist' | 'hours' | 'manual'
     └─ Item          lecture | assignment | exam | task
         ├─ title, dueDate?, heldOn? (class date), estimateHours?, status, notes (markdown)
         ├─ source?   { kind: 'usos', eventId }  (for auto-created items)
         └─ Allocation[]   { date, start?, plannedHours, done, actualHours }

CalendarEvent   { date, start, end, title, notes }   local in v1; Google Calendar in v2
```

- **Time blocks.** An allocation with a `start` time is a time block on the
  calendar. Without one, it sits in the day's "todo" strip.

- **Allocations.** An item can be split across several days (e.g. 1h today,
  1h tomorrow). Each allocation is a separate block in the week grid.
- **Actuals.** Checking off an allocation logs `actualHours = plannedHours`.
  You can edit the number if it differed.
- **Item completion** is independent of its allocations. An item is done only
  when it is marked done, because you may finish early or need an extra session.
- **Status** (every item kind): To do → In progress → Done. Older lecture stages migrate on load (watched → in progress; notes/revised → done).

### Progress (per project, chosen by `progressMode`)

- `checklist`: done items / total items (e.g. 7/13 lectures).
- `hours`: sum of `actualHours` / sum of `estimateHours`.
- `manual`: slider 0–100%.

## 3. Views

### 3.0 Home (landing page)
- A 3-day calendar, starting today by default. ‹ › move it one day at a time,
  Today jumps back, and the date label opens a mini month
  (`#/home/<start date>`).
- The planned sessions for the same three days (labelled Yesterday / Today /
  Tomorrow where that fits), with checkboxes and a link to the missed ones.
- A compact project overview (ring, X/Y done, next deadline), sorted by the
  nearest deadline.

### 3.1 Projects pane view
A grid of project cards, grouped by area. Clicking a card opens the project's
details in a panel on the right (`#/projects/<id>`); Esc closes it. Each card shows:
- the project name
- a progress ring with the percentage, filling as progress grows
- **X/Y done** (count of items)
- the next deadline with a countdown, turning red when it is close

More card content will be decided by iterating on the UI.

### 3.2 Week view (bullet journal)
A single screen with no page scroll:

```
┌─────┬─────┬─────┬─────┬─────┐
│ Mon │ Tue │ Wed │ Thu │ Fri │
├─────┴─────┼─────┴─────┴─────┤
│ Sat + Sun │ Month / Someday │
└───────────┴─────────────────┘
```

Each day box is a hybrid of three parts:
1. Calendar events (read-only, in v2) at the top.
2. Structured blocks ("Lecture 5 – OS · 2h", with a checkbox and a link to its
   project). These are allocations.
3. A freeform text area for anything else.

- **Planning is manual.** Drag items or allocations into days and set hours.
- **Capacity** is inferred per day:
  - Start from the weekday's **planning window** (e.g. 18:00–21:00), minus
    calendar events inside it (overlapping events are merged).
  - Add a **global adjustment** (± hours on every day) and the day's own
    **± delta**. A **fixed value** set for the day overrides the calculation.
  - Window and adjustment changes are stored as rules with an effective date
    and apply from today on. Past days keep their old values, and their
    per-day tweaks are locked.
  - Click a day's "planned/capacity" badge for the breakdown and the per-day
    controls. A day turns red when it is over capacity.
- **Reserved time** per weekday (e.g. sleep 23:00–07:00, work 09:00–17:00) is
  drawn with diagonal hatching on the calendar. It's informational only: events
  can still go there. It's versioned with the capacity rules.
- **Overdue tray.** Unfinished allocations from past days move to a "missed"
  tray that is visible on today, so you reschedule them deliberately. They are
  never moved automatically.
- **Month / Someday** box has two tabs:
  - *Backlog*: open items that still need time on the plan. For items with an
    estimate, that is while spent + planned hours are below the estimate; for
    items without one, it is while they have no open allocation. It can be
    filtered by area, and it holds the overdue tray.
  - *Month notes*: freeform text for the month.

- **Week picker.** Click the "W41 5 Oct – 11 Oct" label and pick any date to
  jump to its week (`#/week/<monday>`).

### 3.3 Project panel
The project's items, overview doc and progress log, as tabs in the side panel.

### 3.4 Calendar (Google-Calendar-like)
- **Sidebar:** a Create button, a mini month (click a day to jump to it; the
  visible range is tinted), and "My calendars" toggles to show or hide events
  and each area's sessions (stored per device).
- **Toolbar:** Today, ‹ ›, the period title, and a view switcher
  (Day / 3 days / Week / Month). Routes look like `#/calendar/<view>/<date>`.
  Coming to the calendar from another page always opens the **default view**
  (Settings → Calendar, Week by default) at today.
- **Time grid:**
  - Click a slot for an event of the default length (Settings → Calendar,
    1 h by default), starting on the half hour, or on the quarter hour for
    defaults under 30 min. Drag to select any range in 15-minute steps; even a
    tiny drag gives a 15-minute event. Either opens a floating quick-create card next to the
    selection, not a modal.
  - Click the all-day row for an all-day event.
  - Drag blocks to move them, and drag a block's bottom edge to resize it.
  - Click an event for its floating editor; click a session for the task
    overlay.
- **Month view:** click an empty cell for an all-day event. Drag entries
  between days. "N more" and day numbers open the day view.

### 3.5 Task overlay
Clicking any task (in the week view, backlog, calendar, home or project panel)
opens an overlay with:
- the title, project, kind and status;
- the due date, class date and estimate;
- spent / planned / remaining hours;
- every session, each with an editable date, start, planned and actual hours;
- markdown notes;
- mark complete, open project, and delete.

### 3.6 Feedback and motion
- Every interactive element has hover and press states, and buttons press in
  slightly.
- Popovers and menus grow from their trigger and shrink away; dialogs rise in.
- Pages fade in, and changing period (week, day, month, mini month) slides in
  from the direction you moved.
- Blocks settle in when created or dropped, slide to their new position, lift
  while dragged, and drop targets light up. Done items get a strike-through
  that draws across, and checkboxes pop.
- Progress rings fill up on load.
- **Toasts with Undo** confirm deletions and completions. Undo restores the
  data from just before the action, but only if nothing changed since, so it
  can never drop later edits. This replaces confirm dialogs, except for
  deleting a project or area and for import/reset.
- Everything respects `prefers-reduced-motion`.

### 3.7 Theme
Auto (follows the system) / light / dark. The toggle is in the header, and the
choice is stored per device.

## 4. Integrations (v2)

### 4.1 Google Calendar (personal account only)
- Two-way: view, create and edit events.
- **Time blocks.** Optionally mirror allocations as events in a dedicated
  "Study/Projects" calendar.
- Work (corp) calendar is out of scope because the corp account blocks
  third-party OAuth apps.

### 4.2 USOSWeb timetable
- The user subscribes to the USOS iCal URL in Google Calendar (Add calendar →
  From URL). The app reads that calendar through the Calendar API, so no CORS
  proxy is needed. Google refreshes subscribed feeds every ~8–24h.
- **Per-course rules** on import, by course and class type
  (lecture/exercises/lab). For example, "OS lectures → create a Learn item with
  a 1.5h estimate; OS labs → ignore". New matching events become items under
  the course's project. Deduplication uses the event UID.

## 5. Roadmap

- **v1 — local UI.** ✅ Areas, projects and items; pane view with rings; week
  grid with split allocations, capacity and the overdue tray; project log and
  overview doc; JSON export/import.
- **v1.1 — iteration 2.** ✅ Performance pass; home page; calendar view with
  local events and time blocks; task overlay; projects side panel; week
  picker; light mode.
- **v1.2 — iteration 3.** ✅
  - Calendar: Google-Calendar-style interactions (drag-select, floating
    editor, resize), sidebar mini month and layers, Day / 3-day / Week / Month
    views, all-day events.
  - Inter font, and styled dropdowns, date and time pickers throughout.
  - Resizable projects split; editable log entries; three task statuses.
  - Inferred, versioned capacity; reserved time.
- **Next iteration — keyboard shortcuts** (see 5.1).
- **v2 — Google.** Sign-in, Drive sync, Calendar two-way (the local events
  become Google events, and time blocks go to a "Study/Projects" calendar),
  USOS rules.
- **Later.** Suggested scheduling (a backward-from-deadline spread), timers,
  more card metrics (at-risk indicator, hours this week, backlog count), undo,
  search.
- **Long-term.**
  - Moodle integration: assignments and deadlines from the course pages,
    probably through Moodle's web-service API or its calendar export.
  - Curriculum import: turn a course description pasted from USOS into lecture
    items, with Google Gemini doing the extraction (see 5.2).
  - RSS feed client: a reader pane for course, blog and release feeds.
    Fetching feeds needs a CORS proxy or a small backend, which this
    serverless app avoids today, so it needs a design decision first.

### 5.1 Keyboard shortcuts (next iteration)

Follow Google Calendar wherever an equivalent exists, and Gmail-style
conventions for everything else. Single-key shortcuts are disabled while
typing in a field, and Ctrl/Cmd combinations are left to the browser.

| Keys | Action | Source |
|---|---|---|
| `j` / `n` | Next period (week, or 3 days on Home) | Google Calendar |
| `k` / `p` | Previous period | Google Calendar |
| `t` | Jump to today | Google Calendar |
| `g` | Go to date (opens the week picker) | Google Calendar |
| `w` | Calendar week view | Google Calendar |
| `x` | Home (3-day view; GCal's "custom view") | Google Calendar |
| `1`–`5` | Home / Week (journal) / Calendar / Projects / Settings | GCal-style numeric view keys |
| `c` | Create: an event in the calendar, a task elsewhere | Google Calendar |
| `e` / `Enter` | Open details of the selected task or event | Google Calendar |
| `Delete` / `Backspace` | Delete the selected event or session (with undo) | Google Calendar |
| `Esc` | Close the overlay, then the side panel | Google Calendar |
| `?` | Shortcut help | Google Calendar / Gmail |
| `/` | Search (once search exists) | Google Calendar / Gmail |
| Arrow keys | Move the selection between blocks and days | — |
| `Space` | Toggle the selected session done | — |
| `Ctrl+Z` | Undo the last change | standard |

Open questions for that iteration:
- **Selection model.** Probably a focus ring on the blocks, so arrow keys and
  `e` have a target.
- **Undo.** Whether it covers every change or only deletes.

### 5.2 Curriculum import (long-term)

Paste a course description, for example the "Pełny opis" section from USOS,
and get one item per lecture or topic, with the original wording kept.
Sample inputs and the output we expect from them live in
`docs/curriculum-import/` and double as evaluation fixtures.

**Flow**
1. In the project panel: **Import curriculum…** → paste the text (any
   language; the examples are Polish).
2. The app calls the Gemini API with the prompt and response schema below.
3. **Review screen** before anything is created:
   - an editable table of topics;
   - the model's warnings;
   - every correction the model reports;
   - a "not verbatim" flag on any title or description that isn't found in
     the pasted text (whitespace-insensitive). This catches paraphrasing.
4. Choose the granularity:
   - **one item per topic** (e.g. "Wykłady 5–8: Pisanie prac naukowych"), or
   - **one item per lecture number** (Lecture 5…8, all with that topic's
     title and description).
5. The import creates `kind: 'lecture'` items with title = topic title, notes
   = description, and an estimate from a default. `courseNotes` goes into the
   project's overview doc.

**Gemini call**
- Endpoint: `models/<model>:generateContent`, with a current Gemini Flash
  model that is configurable in Settings.
- Use structured output: `responseMimeType: 'application/json'` plus a
  `responseSchema`.
- Temperature 0.
- API key: entered by the user in Settings and stored only on that device.
  This is acceptable for a single-user personal app. Verify that the API
  accepts browser (CORS) requests; if it doesn't, use a tiny proxy.
- The pasted text is sent to Google. Say so in the import dialog.

Response schema:

```json
{
  "topics": [{ "title": "string", "description": "string", "lectureFrom": "integer|null", "lectureTo": "integer|null" }],
  "courseNotes": "string",
  "warnings": ["string"],
  "corrections": [{ "from": "string", "to": "string" }]
}
```

System instruction (draft):

> You extract the lecture plan from a university course description. Return
> JSON that matches the schema.
>
> 1. Extract only the lectures or topics of the syllabus: numbered lists, or
>    headings like "Wykłady 5–8: …". Do not create topics from the course goals,
>    the schedule or the assessment rules.
> 2. Preserve the original wording and language **verbatim**. Do not
>    translate, paraphrase, summarise, shorten or reorder. You may only fix
>    obvious typos, capitalisation at the start of a sentence, and broken
>    whitespace or line breaks.
> 3. `title`: the topic heading without its numbering prefix ("Wykłady 1-4:",
>    "3."). `description`: the text that belongs to that topic, verbatim,
>    joined into one paragraph. Use an empty string if there is none. Never
>    invent a description.
> 4. `lectureFrom` / `lectureTo`: the lecture numbers if they are stated (both
>    the same for a single lecture), otherwise null. Keep ranges exactly as
>    written, even if they overlap or leave gaps.
> 5. `courseNotes`: verbatim sentences about scheduling that matter for
>    planning (how often lectures happen, whether the order may change), or an
>    empty string.
> 6. `warnings`: overlapping or missing lecture numbers, ambiguous structure,
>    or a note that the order may change.
> 7. `corrections`: every change you made to the original text, as `from` /
>    `to` pairs.

**What the examples exercise**
- Example 1 has topic blocks over ranges of lectures that overlap: lecture 8
  is in 5–8 and 8–9, and lecture 9 is in 8–9 and 9–10. It also mixes `-` and
  `–` in the ranges.
- Example 2 has a goal and schedule preamble that must not become topics, 17
  numbered single lectures with no description, and one capitalisation fix.

**Testing.** A unit test feeds the fixtures through the response validation
and the "not verbatim" check. An opt-in live evaluation (run with an API key)
compares Gemini's output against the `*.expected.json` files.

**Open questions**
- **Default granularity for overlapping ranges.** Per topic, or per lecture
  with overlaps merged into one item titled "Etyka / Pisanie prac…"?
- **Linking to the USOS timetable.** Should imported lectures be matched to
  USOS timetable events in order, so each gets its `heldOn` date
  automatically?
