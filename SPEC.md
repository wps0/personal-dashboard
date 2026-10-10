# Personal Dashboard — Spec

One place for all ongoing life and professional projects: status, progress,
deadlines, a weekly bullet-journal plan with hours per day, and (later) a
two-way Google Calendar integration. Primary user: a working SWE-SRE who also
studies CS and accumulates a backlog of lectures and projects.

Status: **decisions from the initial grilling session (2026-10-10).** Items
marked _TBD_ are still open.

## 1. Architecture

| Decision | Choice |
|---|---|
| Hosting | Static site on GitHub Pages, no backend. |
| Storage (v1) | Browser storage (IndexedDB) behind a `Storage` interface, with JSON export/import. |
| Storage (v2) | Same interface, backed by a JSON file in the user's Google Drive (`drive.file` scope — the app sees only files it creates). |
| Auth (v2) | Google sign-in with an OAuth Client ID from a GCP project the user owns, in "testing" mode. One login covers Drive and Calendar. |
| Devices | Desktop-first, phone usable. The week grid targets laptop/desktop; on narrow screens it collapses to a single-day/list view for quick check-offs. Installable as a PWA. |
| Stack | _TBD_ |
| Visual style | Dense, dark-first dev-tool look (Linear/Grafana-like): compact, monospace accents. |

## 2. Data model

```
Area            e.g. University, Work, Personal, Side projects
 └─ Project     e.g. "Operating Systems (course)", "Homelab migration"
     ├─ overviewDoc   markdown: goals, links, decisions (one living doc)
     ├─ log[]         timestamped progress entries ("2026-10-10: finished part 2")
     ├─ progressMode  'checklist' | 'hours' | 'manual'
     └─ Item          lecture | assignment | exam | task
         ├─ title, dueDate?, estimateHours?, status, done
         ├─ source?   { kind: 'usos', eventId }  (for auto-created items)
         └─ Allocation[]   { date, plannedHours, done, actualHours }
```

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

### 3.1 Projects pane view
A grid of project cards, grouped or filtered by area. Each card shows:
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
- **Month / Someday** box: items with no allocations yet, or due later.

### 3.3 Project detail
The project's items (with allocations and status), its overview doc and its
progress log.

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

- **v1 — local UI.** Areas, projects and items; pane view with rings; week
  grid with split allocations, capacity and the overdue tray; project log and
  overview doc; JSON export/import.
- **v2 — Google.** Sign-in, Drive sync, Calendar two-way plus time blocks,
  USOS rules.
- Later: suggested scheduling (a backward-from-deadline spread), timers, and
  more card metrics (at-risk indicator, hours this week, backlog count).
