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
- **Lecture status:** not started → watched → notes done → revised (optional).

### Progress (per project, chosen by `progressMode`)

- `checklist`: done items / total items (e.g. 7/13 lectures).
- `hours`: sum of `actualHours` / sum of `estimateHours`.
- `manual`: slider 0–100%.

## 3. Views

### 3.0 Home (landing page)
- A 3-day calendar (today plus the next two days).
- The planned sessions for those days, with checkboxes and a link to the
  missed ones.
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
- **Capacity.** Each day has a capacity (configurable per weekday, e.g. 2h on
  weekdays and 5h on weekends). In v2, calendar busy time is subtracted. A day
  turns red when it is over capacity.
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

### 3.4 Calendar
A week time grid with prev/next and the week picker.
- Shows local events and timed sessions.
- Each day has a "todo" strip of sessions that have no time yet; drag one onto
  the grid to time-block it, or drag a block back to the strip to clear its time.
- Click an empty slot to create an event. Drag events and blocks to move them.

### 3.5 Task overlay
Clicking any task (in the week view, backlog, calendar, home or project panel)
opens an overlay with:
- the title, project, kind and status;
- the due date, class date and estimate;
- spent / planned / remaining hours;
- every session, each with an editable date, start, planned and actual hours;
- markdown notes;
- mark complete, open project, and delete.

### 3.6 Theme
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
