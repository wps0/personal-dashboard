# Personal Dashboard — Spec

One place for all ongoing life and professional projects: status, progress,
deadlines, a weekly bullet-journal plan with hours per day, and (later) a
two-way Google Calendar integration. Primary user: a working SWE-SRE who also
studies CS and accumulates a backlog of lectures and projects.

Status (2026-10-12): v1–v1.6 are implemented: the local app, keyboard
shortcuts, a **read-only** Google Calendar integration, and a quality and
polish pass, and the USOS timetable import (4.2). Next: the rest of v2. See README.md for
running and deploying it.

## 1. Architecture

| Decision | Choice |
|---|---|
| Hosting | Static site on GitHub Pages, no backend. Deployed by GitHub Actions from `main` only (see 6). |
| Storage (v1) | Browser storage (IndexedDB) behind a `Storage` interface, with JSON export/import. |
| Storage (v2) | Same interface, backed by a JSON file in the user's Google Drive (`drive.file` scope — the app sees only files it creates). |
| Auth | Google sign-in (Google Identity Services token model, browser only, no refresh tokens) with an OAuth Client ID from a GCP project the user owns, in "testing" mode. Today it asks only for read-only Calendar access (4.1); Drive (v2) will join the same login. The access token lives in `sessionStorage` and expires after an hour (Reconnect). |
| Devices | Desktop-first, phone usable. Below 640px: an icon-only header with scrollable tabs, the calendar opens in 3-day view when the default is Week, Settings rows stack, and the week journal's days stack into a list. Installable as an app (PWA; Settings → App), and usable offline after the first visit (a service worker caches the app's own files only, never API calls). |
| Stack | React + TypeScript 6.0 + Vite, Tailwind CSS, dnd-kit (drag and drop), Zustand (state), Radix Popover. TypeScript stays on 6.0 (the last release with a JavaScript API) until ESLint's TypeScript support handles 7. |
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
- **Dragging** shows where the block will land, snapped to 15 minutes, with
  its new time ("20:00 – 21:30"), and the drop lands exactly there. The
  target is the column under the pointer. Over the all-day row, month cells
  and the week journal, a small copy hangs just below the pointer.
- **Short blocks** (under 45 minutes) show one line, "Title, 16:30", like
  Google Calendar; taller ones show the title and a time line.
- **Floating cards** open beside the block. When the block is too wide for
  that (Day view), the card overlaps the block's right edge so it stays on
  screen. The quick-create card has a top bar with a grip: drag it (or use
  the arrow keys on it) to move the card.
- **All-day row:** a multi-day event is one bar across its days, with
  pointed ends where it continues past the visible days; overlapping bars
  stack in lanes. A chevron collapses the row to 2 rows plus "N more"
  (remembered per device).
- **Google calendars** (read-only, 4.1) appear in all views in their own
  colours, with a sidebar section to show or hide each one and refresh.
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
choice is stored per device. Text on the accent colour (primary buttons,
today's date) is dark navy in the dark theme and white in the light theme.

### 3.8 Settings
Sections (Calendar, Google Calendar, Capacity & reserved time, Areas, Data)
are cards with a heading and a one-line hint.

## 4. Integrations (v2)

### 4.1 Google Calendar (personal account only)

**Today: read-only (v1.4).** Deliberately, so we see how it works before
asking for write access.
- **Scopes:** only `calendar.events.readonly` and
  `calendar.calendarlist.readonly` (least privilege). Sign-in fails with an
  explanation if either is unticked on the consent screen. Sign-out revokes
  the token.
- **Calls:** GET only. Events per visible range (`singleEvents=true`, all
  pages), cached for 5 minutes and refreshed when the window regains focus.
- **Display:** Google's colours are preserved (event colour, else the
  calendar's), with readable text on each. Clicking opens a read-only card
  (sanitized description, location, link to edit in Google Calendar).
- **Declined invitations** are shown outlined and struck through, and never
  count as busy. Events the organiser cancelled never arrive.
- **Capacity:** busy Google events inside the planning window reduce the
  day's capacity like local events. "Free", all-day and working-location
  entries don't count.
- **Errors** are explained in plain language (API not enabled, no access,
  not found, rate limited, offline…) with a link to fix them where Google
  gives one, and a Retry button. Rate limits and server errors are retried
  3 times with backoff. One failing calendar doesn't hide the others.

**Later (v2): two-way.**
- Create and edit events (the local events become Google events).
- **Time blocks.** Optionally mirror allocations as events in a dedicated
  "Study/Projects" calendar.
- Work (corp) calendar is out of scope because the corp account blocks
  third-party OAuth apps.

### 4.2 USOSWeb timetable ✅
- **Source** (Settings → USOS timetable): one of the user's Google calendars
  (a USOS iCal feed subscribed in Google Calendar, which Google refreshes
  every ~8–24h), or a direct iCal link (`https` only, fetched without cookies
  or referrer; it needs USOS to allow cross-site requests). "Check" lists the
  courses found, with their class types.
- **Event titles** look like `<TYPE> - <course title>`, e.g.
  `WYK - Implementacja systemów operacyjnych`, `LAB - Programowanie
  mikrokontrolerów`, `CW - Złożoność obliczeniowa`,
  `SEM-MGR - Dane, strumienie, rozpraszanie`. The type is split off first;
  other events in the calendar are ignored.
- **Per project** (a university course): a course pattern, a case-insensitive
  regular expression matched against the **course title only**, never the
  type. The panel shows which timetable courses it matches.
- **One regular task per class meeting** (lectures too), titled
  "WYK · Wed 14 Oct, 10:15", with `heldOn` = the class date and the time and
  room in its notes. Classes from about a semester back to half a year ahead
  are considered.
- **Reviewed, never silent:** "N new classes from USOS · Review" on Home and
  in the course's project panel opens a list, all ticked. Ticked classes
  become tasks; unticked ones are skipped. Both are remembered (by iCal UID +
  start, the same from either source) and never offered again, even if the
  task is later deleted. "Not now" leaves them for later. One undo step.

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
- **v1.3 — keyboard shortcuts.** ✅ See 5.1. Includes undo (5.1).
- **v1.4 — Google Calendar, read-only.** ✅ See 4.1.
- **v1.5 — quality and polish.** ✅
  - Lint (Google's TypeScript style), formatting, CI checks on every pull
    request, deploys from `main` only (see 6).
  - Drag preview, compact short events, movable create card, collapsible
    all-day row, cards that stay on screen, `h` / `l` tab switching.
  - Performance: fewer re-renders (opening a card no longer re-renders the
    calendar; memoized form widgets), and Projects, Settings and the
    Markdown renderer load separately.
  - Phone layout fixes (see Devices in 1).
- **v1.6 — USOS timetable import.** ✅ See 4.2.
- **v2 — Google.** Drive sync, Calendar two-way (the
  local events become Google events, and time blocks go to a
  "Study/Projects" calendar), Google events in the week journal's day boxes
  (3.2).
- **Later.** Suggested scheduling (a backward-from-deadline spread), timers,
  more card metrics (at-risk indicator, hours this week, backlog count),
  search, multi-day all-day events drawn as one spanning bar.
- **Long-term.**
  - Moodle integration: assignments and deadlines from the course pages,
    probably through Moodle's web-service API or its calendar export.
  - Curriculum import: turn a course description pasted from USOS into lecture
    items, with Google Gemini doing the extraction (see 5.2).
  - RSS feed client: a reader pane for course, blog and release feeds.
    Fetching feeds needs a CORS proxy or a small backend, which this
    serverless app avoids today, so it needs a design decision first.

### 5.1 Keyboard shortcuts ✅

Shortcuts follow Google Calendar wherever an equivalent exists. Single-key
shortcuts are off while typing in a field and while a popover or dialog is
open. Ctrl/Cmd combinations are left to the browser, except Ctrl/Cmd+Z. Press
`?` in the app (or the keyboard icon in the header) for the list.

| Keys | Action |
|---|---|
| `j` / `n`, `k` / `p` | Next / previous period: a day on Home, a week in the journal, the current view's period in the calendar |
| `t` | Today |
| `g` | Go to date (mini-month dialog) |
| `1`–`5` | Home / Week (journal) / Calendar / Projects / Settings |
| `h` / `l` | Previous / next tab, wrapping around (like vim's `gT` / `gt`) |
| `d` / `x` / `w` / `m` | Calendar Day / 3 days / Week / Month (opens the calendar from other pages) |
| `c` | Create an event at the next full hour. With a project open, focus its "new item" field instead. From the journal or settings, open the calendar with the draft. |
| `↑ ↓ ← →` | Move the selection to the nearest block in that direction (spatial: works in grids, the journal, the backlog and lists) |
| `e` / `Enter` | Open the selected block (event editor or task overlay) |
| `Space` | Toggle the selected session done |
| `Delete` / `Backspace` | Delete the selected event, remove the session, or delete the item (with Undo). The selection moves to a neighbour. |
| `Ctrl+Z` | Undo |
| `Esc` | Close the popover or dialog, then the side panel |
| `?` | Shortcut help |

**Decisions**
- **Selection is keyboard focus.** Blocks carry `data-block`. The focused
  block gets a strong ring, and arrow keys pick the nearest block on screen
  in that direction.
- **Undo history** (up to 50 steps) covers creating, deleting, completing,
  moving, resizing, scheduling and ticking off. Direct manipulation is
  recorded quietly, without a toast. A step only undoes while the data is
  exactly what it left behind, so several Ctrl+Z presses walk back in order,
  and undo never drops a change it didn't record. Text edits use the field's
  own undo.
- **Later:** redo (Ctrl+Shift+Z), `/` search, and keyboard dragging (dnd-kit's
  keyboard sensor).

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

## 6. Engineering

- **Code style:** ESLint with the rules of Google's `gts` (Google TypeScript
  style), copied into `eslint.config.js` rather than installed (the package's
  setup tool pulls in a dependency with an unfixed advisory), plus React's
  hooks rules. Two deviations, both documented there: `== null` is allowed
  (as the style guide itself allows), and named function expressions are
  allowed for `memo(function Name…)`. Prettier with gts's settings.
- **Checks:** `npm run lint`, `format:check`, `typecheck`, `test`, `build`.
  The **Checks** workflow runs them on every pull request with a read-only
  token and no secrets; it can never deploy.
- **Deploy:** the **Deploy** workflow builds and publishes to GitHub Pages
  only from `main`. The build job can only read; only the deploy job (which
  runs no repository code) can publish. The `github-pages` environment must
  be limited to `main` in the repository settings, since the site's origin
  holds the app's data and is trusted by the Google OAuth client.
- **Changes** go in small, focused pull requests, stacked when they build on
  each other.
