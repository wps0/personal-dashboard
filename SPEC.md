# Personal Dashboard — Spec

One place for all ongoing life and professional projects: status, progress,
deadlines, a weekly bullet-journal plan with hours per day, and (later) a
two-way Google Calendar integration. Primary user: a working SWE-SRE who also
studies CS and accumulates a backlog of lectures and projects.

Status (2026-10-13): v1–v1.6 are implemented: the local app, keyboard
shortcuts, a **read-only** Google Calendar integration, a quality and polish
pass, and the USOS timetable import (4.2); from v2, Google Drive sync (4.3).
See README.md for running and deploying it.

## 1. Architecture

| Decision | Choice |
|---|---|
| Hosting | Static site on GitHub Pages, no backend. Deployed by GitHub Actions from `main` only (see 6). |
| Storage (v1) | Browser storage (IndexedDB), as protobuf binary (see Data schema in 6), with export/import as protobuf's JSON form. |
| Storage (v2) | ✅ IndexedDB stays the local copy on every device; Drive sync (4.3) keeps a protobuf file in the user's Google Drive in step with it (`drive.file` scope — the app sees only files it creates). |
| Auth | Google sign-in (Google Identity Services token model, browser only, no refresh tokens) with an OAuth Client ID from a GCP project the user owns, in "testing" mode. It asks only for what's on: read-only Calendar access while the calendar is connected (4.1), and `drive.file` while Drive sync is on (4.3); each token carries just those. The access token lives in `sessionStorage` and expires after an hour (Reconnect). |
| Devices | Desktop-first, phone usable. Below 640px: an icon-only header with scrollable tabs, the calendar opens in 3-day view when the default is Week, Settings rows stack, and the week journal's days stack into a list. Installable as an app (PWA; Settings → App), and usable offline after the first visit (a service worker caches the app's own files only, never API calls). |
| Stack | React + TypeScript 6.0 + Vite, Tailwind CSS, dnd-kit (drag and drop), Zustand (state), Radix Popover. TypeScript stays on 6.0 (the last release with a JavaScript API) until ESLint's TypeScript support handles 7. |
| Visual style | Dense, dark-first dev-tool look (Linear/Grafana-like): compact, monospace accents. |

## 2. Data model

```
Area            e.g. University, Work, Personal, Side projects
 └─ Project     e.g. "Operating Systems (course)", "Homelab migration"
     ├─ overviewDoc   markdown description: goals, links, decisions (one living doc)
     ├─ log[]         timestamped progress entries ("2026-10-10: finished part 2")
     ├─ progressMode  'checklist' | 'hours' | 'manual'
     ├─ groups[]      { id, name, collapsed }   folders for its items, e.g. "Classes", in display order
     ├─ importGroupId?  the group USOS classes and curricula were last imported into
     ├─ ungroupedCollapsed  "No group" is folded
     └─ Item          class | assignment | exam | task   (class: a lecture, lab, tutorial or seminar)
         ├─ title, dueDate?, heldOn? (class date), estimateHours?, status, notes (markdown)
         ├─ source?   { kind: 'usos', eventId }  (for auto-created items)
         ├─ groupId?  one of its project's groups
         └─ Allocation[]   { date, start?, plannedHours, done, actualHours }

CalendarEvent   { kind (event | reserved), date, start, end, title, notes, recurrence?, skippedDates[], seriesId?, seriesDate? }   local in v1; Google Calendar in v2
WorkSpan        { date, start, end, note? }   the work log: time actually worked
```

- **Groups.** A project's items can be put in named groups, one level deep
  (no groups inside groups). Deleting a group keeps its items, in no group;
  an item whose group is gone (e.g. deleted on another device) is in no group
  too. Groups only arrange the project panel: progress, the backlog and the
  calendar ignore them.

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
- A small work card under it: today's logged work (or the planned work with
  **Log as planned**) and the week's hours against its target (SPEC 3.10).

### 3.1 Projects pane view
A grid of project cards, grouped by area. Clicking a card opens the project's
details in a panel on the right (`#/projects/<id>`); Esc closes it. Each card shows:
- the project name
- a progress ring with the percentage, filling as progress grows
- **X/Y done** (count of items)
- the next deadline with a countdown, turning red when it is close

More card content will be decided by iterating on the UI.

### 3.2 Week view (bullet journal)
A single screen with no page scroll. It always runs Monday–Sunday (the week
start in Settings is for the calendar):

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
  - The planned hours set against capacity are the untimed sessions plus the
    part of timed ones inside the planning window: a class at noon doesn't
    use evening planning time.
- **Reserved time** (e.g. sleep 23:00–07:00, work 09:00–17:00) is a kind of
  event: reserved events, which usually repeat (see Repeating events in 3.4).
  - **Drawn with diagonal hatching** on the calendar. Informational only:
    events can still go there, and it doesn't take capacity. The month view
    leaves it out.
  - **Can end after midnight:** an end before the start ends the next day
    (sleep). It's drawn at the end of its day and the start of the next, and
    edited in its card only.
  - **The block's label** (top right, above events) is its handle: drag it
    to move the block, also to another day; drag the block's top or bottom
    edge to resize it. Like any repeating event dragged on the calendar,
    that changes that day only. The block itself stays see-through, so
    clicking it still creates an event.
  - **Clicking the label** opens its event card: label, times, Repeat, and
    for a repeating one "Changes apply to" and **Back to the repeating
    event**. No colour. All of it is undoable.
  - **Created** with the quick-create card's **Reserved** tab: a label (e.g.
    Gym), times and Repeat, no all-day.
  - **Before schema version 3,** reserved time lived in Settings (per
    weekday, versioned with the capacity rules, and a day's own once edited
    on the calendar). The step to version 3 turns it into reserved events:
    the same range on several weekdays becomes one repeating event from the
    rule's date to the next rule's, and a day with its own reserved time
    gets one-off events while the repeating ones skip it. Settings → Capacity
    has the planning windows and the global adjustment; each weekday's copy
    button copies its planning window to the days you tick.
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
  jump to its week (`#/week/<monday>`). A link to any other day opens the week
  containing it.

### 3.3 Project panel
The project's items, description (its overview doc, Markdown) and progress
log, as tabs in the side panel.

- **Description next to the items.** On a wide panel (56rem and up) the
  rendered description is a column to the right of the task list; on a
  narrower one (phones, the default split on a small laptop) it is a
  collapsible block above the list, showing its first line when collapsed
  (remembered per device). Edit switches it to a textarea, saved as you
  type; double-click works too. An empty description is only a small
  "+ Add a description" link. The description tab keeps the full-height
  editor.
- On narrow panels (phones, or a wide project list) the items table drops
  its estimate and spent/plan columns, which the task overlay shows, and
  long titles are cut short, so the table never scrolls sideways.
- **Groups** (folders for items, e.g. all classes of a course). Each group is
  a collapsible header with its name (click to rename), item count and
  done/total, in the project's group order. Items in no group come first,
  under "No group", then the groups. The add field sits at the top of the
  list, right above them; it adds to no group.
  Folded groups (and a folded "No group") are kept in the data, so they stay
  folded after a reload and sync to other devices. Folding is a quiet undo
  step. Folds that earlier versions kept per device are moved into the data
  once.
- **+ group** creates one. A row's folder button (on hover) or the Group
  select in the task overlay moves an item. A group's ⋯ menu moves the
  ungrouped items of a kind (e.g. every class not yet in a group) into it in
  one step; items already in another group stay where they are. It also
  moves the group up or down, or deletes it: its items stay, in no group,
  and Undo brings it back. An empty group offers the same one-step moves.
- **Reordering:** drag a group by the grip left of its name (it shows on
  hover; always on touch screens, where a press starts the drag). A line
  shows where it lands, above or below the group under the pointer; Esc
  cancels. "No group" stays first. Undoable, without a toast.
- **Selecting tasks:** click a row to select it (tinted); double-click it,
  or press Enter on its title, to open the task. Shift-click selects every
  task from the last clicked one to this one, both included, in the order
  they're listed (done tasks hidden by "Hide done" and tasks in folded groups
  aren't listed). Ctrl/Cmd-click adds or removes one row. With two or more
  selected, a bar floats below the list with how many, **Move to…** and
  **Clear**; Esc clears the selection before it closes the panel (not while a
  task or a dialog is open).
- **Moving several tasks:** drag any selected row onto a group, or onto
  "No group", to move them all: the group lights up, a label says "3 tasks",
  and a toast offers Undo.
  A row that isn't selected drags alone. Rows drag from anywhere but their
  text fields (a press on touch screens); not while the project has no
  groups.
- An open group has its own add field, whose kind follows the group's last
  item; **+ bulk** can add into a group too.
- **Done items sink to the bottom** of their group (or of "No group"), so
  they don't mix with open ones; both parts keep the planning order (due
  date, then class date, then title).

### 3.4 Calendar (Google-Calendar-like)
- **Sidebar:** a Create button, a mini month (click a day to jump to it; the
  visible range is tinted), and "My calendars" toggles to show or hide events
  and each area's sessions (stored per device).
- **Toolbar:** Today, ‹ ›, the period title, and a view switcher
  (Day / 3 days / Week / Month). Routes look like `#/calendar/<view>/<date>`.
  Coming to the calendar from another page always opens the **default view**
  (Settings → Calendar, Week by default) at today.
- **Week start.** The Week and Month views, and the mini months (sidebar,
  date fields), start their weeks on the day set in Settings → Calendar
  (Sunday by default). The week number is the ISO week of the week's middle
  day, i.e. the ISO week holding most of its days: exactly the ISO week for a
  Monday start, the Wednesday's for a Sunday start. The week journal ignores
  the setting: it always runs Monday–Sunday.
- **Time grid:**
  - Click a slot for an event of the default length (Settings → Calendar,
    1 h by default), starting on the half hour, or on the quarter hour for
    defaults under 30 min. Drag to select any range in 15-minute steps; even a
    tiny drag gives a 15-minute event. Either opens a floating quick-create card next to the
    selection, not a modal.
  - Click the all-day row for an all-day event.
  - The quick-create card has **Event | Time block | Reserved** tabs, like Google
    Calendar's, between the title (or task search) and the rest of the card.
    (Not "Task", which is something else in Google Calendar.) Time block
    plans time for one of your tasks instead: search open tasks by
    title or project (without a query it lists the ones that still need
    time, with the hours left), and Save adds a session at the chosen time.
    The block is that session, so moving, resizing or deleting it changes
    the task's plan; there's no separate event to keep in sync.
  - Drag blocks to move them, and drag a block's bottom edge to resize it.
  - Click an event for its floating editor; click a session for the task
    overlay.
  - **Repeating events:**
    - **Repeat** in the quick-create card and the event card is like Google
      Calendar's: Does not repeat, Daily, Weekly on (its weekday), Every
      weekday (Monday to Friday), or Custom.
    - Custom means every N days or weeks, on chosen weekdays, ending never,
      on a date, or after N times (stored as the date of the last one).
    - Stored once, on the first date, with the rule and the dates it skips.
      Each occurrence is shown on its day.
    - **On the calendar, dragging or resizing an occurrence (or pressing
      Delete on it) changes that day only.** That occurrence becomes an
      event of its own, and the repeating event skips its date.
    - **The event card on an occurrence** asks what changes apply to: *This
      event* (the default), *This and following* (the repeating event is
      split there), or *All events*. Moving all events to another day moves
      every occurrence by the same number of days.
    - A new Repeat rule applies from that occurrence on, or to all of them.
    - Delete offers the same three choices, with Undo.
    - An occurrence changed on its own remembers its date in the repeating
      event; its card offers **Back to the repeating event**, which drops
      the change.
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
- **Deadlines:** a task with a due date shows on that day, in the all-day
  row and in month cells, as a flag chip in its area's colour (the flag turns
  red once an open task is overdue; done tasks are struck through). Clicking
  it opens the task overlay. Tasks of archived projects and hidden areas are
  left out.
- **Event colours:** a local event can take one of Google Calendar's 11
  event colours (Tomato … Graphite), picked from the colour dot in the
  card's "Events" row, like Google's calendar row; unset is the default event
  colour. The stored values are Google's own colorId, so a colour carries
  over as is once events sync with Google.
- **Google calendars** (read-only, 4.1) appear in all views in their own
  colours, with a sidebar section to show or hide each one and refresh. An
  event with its own colour is drawn in it; all-day chips start with a strip
  in their calendar's colour, like Google Calendar (not on a bar's pointed
  end continuing from before the view).
- **Month view:** click an empty cell for an all-day event. Drag entries
  between days. "N more" and day numbers open the day view.

### 3.5 Task overlay
Clicking any task (in the week view, backlog, calendar or home), or
double-clicking one in the project panel, opens an overlay with:
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
Sections (Calendar, Google Calendar, Capacity, Work log, Areas, Data)
are cards with a heading and a one-line hint. Calendar holds the default event
length, the default view and the first day of the week (Monday … Sunday;
Sunday by default), which is part of the synced data. Capacity rules stay per
weekday and are listed Monday first whatever the week start.

### 3.9 How many actions things take (UX review, October 2026)
Counted in a browser for 37 everyday tasks, from a fresh Home page with the
sample data. One action is a click, key press, drag, scroll or typed field.
Google's own screens and Drive sync were counted from the code. Verdict: it
works, but it takes too much clicking around (see the TODO in 5).

**Quick already:** today's plan 0 (desktop); check off a session 1; open a
project from Home 1; move or time-block a session 1 drag; add an event 3;
review new USOS classes 2; page, week and view switching 1–2 keys.

**Costliest for how often they're done:**

| Task | Actions now | Why |
|---|---|---|
| Plan a backlog item onto a day | 2 by drag; 6 by clicks; 7 on phone; 52 by keyboard; 4 to give it a time | The backlog is only on Week, never next to a time grid; the task card can only add a session for today |
| Log progress on a project | 5 | The log is the panel's third tab |
| Change a status / mark complete | 3–4 | Behind a dropdown in the task card |
| Add a task | 4 (8 with due date and estimate) | Needs its project open first |
| Reconnect Google (hourly) | 2 + Google's popup | Only in Calendar or Settings |
| Add a day note | 3 | Day notes are only on Week |
| Phone: reschedule a missed session; add an event; jump to a date | 6; 4–5; 6 | Missed list at the bottom of Week; title not focused; no month picker in Calendar |
| Keyboard: check off; event at a set time | 4; 8 | Selection starts on the calendar; `c` fixes the next hour |

Also found: on a phone the calendar layers can't be shown or hidden (the
sidebar is hidden), and a tap on a short event may hit its resize grip
(seen in emulation).

**The pattern:** Home answers "what's today", but nearly every change happens
somewhere else (backlog and day notes on Week, the log in the panel, status
behind a dropdown, Google reconnect in Calendar or Settings).

### 3.10 Work log (`#/work`)
The plan is reserved time named as work: reserved events with that label
(Work by default; Settings → Work log). The work log records what was actually worked: stretches of time
(start – end) per day, synced like everything else.

- **The Work page**, a tab of its own (key 5), shows a week at a time,
  Monday to Sunday, like the week journal; ‹ › and `j` / `k` move by a week,
  `t` comes back to this one.
- **Each day** lists its planned work ("Planned 09:00–17:00", from the
  day's reserved events, including one changed on its own that day), its logged stretches with
  editable start and end and a remove button, and the day's total. A day
  with nothing logged offers **Log as planned** (its planned work, in one
  step); **+ add** adds a stretch after the last one, or the planned work,
  or 09:00–17:00.
- **The week** shows the hours logged against its target, with a bar and
  "N h to go" or "N h over". The target is the default from Settings unless
  the week has its own: typing one on the page sets it for that week only,
  and "Use the default" removes it. 0 means no target. The month totals of
  the months the week touches are shown too.
- **On Home**, a small card at the bottom right shows today (logged, or
  planned with Log as planned) and the week against its target; "edit ↗"
  opens the Work page.
- Everything is undoable.

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
- **One class item per class meeting** (lectures, labs, tutorials…), titled
  "WYK · Wed 14 Oct, 10:15", with `heldOn` = the class date and the time and
  room in its notes. Its estimate is the class's length, and it is planned
  like the class itself: a session on the class's day, at its start time,
  for its length, unless it's left off the calendar in the review. Classes
  from about a semester back to half a year ahead are considered.
- **Reviewed, never silent:** "N new classes from USOS · Review" on Home and
  in the course's project panel opens a list, all ticked. Ticked classes
  become tasks; unticked ones are skipped. Each class also has an "on
  calendar" tick (all on by default), and the class types above the list
  (e.g. WYK, CW) set it for every class of that type in this review; this
  choice isn't remembered. A project with groups gets a group picker in its
  section of the list: its classes go into that group, and the choice is
  remembered for its next import (also by the curriculum import), starting
  at "No group". Skipped classes are remembered (by
  iCal UID + start, the same from either source) and not offered again, until
  "Show skipped classes again" in Settings. Imported ones are known by their
  task: deleting it, or its project, offers the class again (e.g. to import it
  into another project). "Not now" leaves them for later. One undo step.

### 4.3 Google Drive sync ✅

Use the dashboard on several devices. Turned on per device in Settings →
Google Drive sync.

- **Storage.** One file, `personal-dashboard.binpb` (protobuf binary), created by the app and
  found again by an app property (so renaming it is fine). Every device keeps
  its own copy in IndexedDB, so the app works offline; the sync base (the
  file's id and version, and the data at the last sync) is stored with it,
  in the same transaction as the data.
- **Duplicate files.** If there are ever several (two first syncs at once, a
  search lagging behind a new file), every sync merges them into the oldest
  (like **Merge both**, with conflicts offered for review) and trashes the
  others, noting which file each went into: a device that was on one of them
  carries on with the oldest, keeping its edits. Nothing is merged or trashed
  while one of them can't be read.
- **Readable copy.** After every upload the app also writes
  `personal-dashboard.json` (protobuf's JSON form, with its own app property),
  for the user to read if the app breaks. The app never reads it; failing to
  write it doesn't fail the sync.
- **Permission.** `drive.file` only, requested when sync is turned on (the
  calendar sign-in alone never asks for it, and sync alone never asks for the
  calendar's scopes). If it's refused, the calendar keeps working and sync
  stays off; with neither on, the app gives its access back.
- **When.** A few seconds after an edit, when coming back to the tab or back
  online, every two minutes while the tab is visible, and with **Sync now**.
  Without a valid token (sessions last an hour) sync waits; Settings offers
  **Connect**.
- **How.** Only this device changed → upload. Only Drive changed → take
  Drive's data. Both → a three-way merge against the base: record by record
  and field by field, so edits to different fields of the same task on two
  devices both survive. If both changed the same field, this device's value
  wins for now and the toast offers **Review**: a dialog lists each conflict
  (record, field, both values) with this device's or the other device's
  version to pick, and applying it never overwrites a value edited since (it
  can be undone). Until then a button in the header (and a line in
  Settings) shows how many are waiting and opens the review. An edit wins over a
  deletion, also one that took its parent along (an edited task brings back
  its deleted project, listed for review too); other records whose parent was
  deleted are dropped. Edits made during a sync are merged in too.
- **First sync on a device.** A blank device takes Drive's data. A device with
  different data asks: **Use Drive's data** or **Merge both** (with an export
  offered first). The same goes for a sync file the device hasn't synced with
  (another Google account's, or one remade on another device): it shares no
  history with this device's data.
- **Safety.** Data from Drive that this version can't read is never
  overwritten. Replacing all data (import, sample data, reset) warns that it
  reaches the other devices. Drive v3 has no conditional writes, so a write
  from another device in the moment between our version check and our upload
  would be overwritten (Drive's revision history keeps it).

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
- **v2 — Google.** ✅ Drive sync (4.3). Still to come: Calendar two-way (the
  local events become Google events, and time blocks go to a
  "Study/Projects" calendar), Google events in the week journal's day boxes
  (3.2).
- **Next — UX rework (TODO).** Make Home the place where planning happens,
  cutting the counts in 3.9. Ideas, each a small change of its own:
  - A "To plan" backlog on Home with a **Plan ▾** menu (Today / Tomorrow /
    date) and dragging onto Home's calendar: planning 2 clicks or 1 drag
    (phone 2), time-blocking 1.
  - One-click status pill on rows (To do → In progress → Done): 1.
  - Today's day note on Home: 2.
  - "Add log note" on the toast after checking off a session: 3.
  - Quick add from any page (`n` or a header "+"), understanding text such
    as `Problem set 3 #OS due fri ~2h`: 3.
  - A "Reconnect Google" chip in the header on every page: 1.
  - Phone: "→ Today / → Tomorrow" on missed sessions, focus the event title,
    a month picker in the Calendar title, a floating "+", a bigger tap target
    on short events, calendar layers reachable.
  - Keyboard: start the selection on today's first planned row; let the `c`
    card take text like `15:00 Gym tomorrow`; arrow keys in the mini month.
- **TODO — own subdomain.** Move the app from the shared `wps0.github.io`
  origin to its own custom subdomain (a verified Pages custom domain with
  Enforce HTTPS), and authorise only that origin in the OAuth client. Until
  then it must stay the account's only Pages site (see 6). Moving changes the
  origin, so each device starts empty there: sync from Drive, or export first.
- **Later.** Suggested scheduling (a backward-from-deadline spread), timers,
  more card metrics (at-risk indicator, hours this week, backlog count),
  search, multi-day all-day events drawn as one spanning bar.
- **Long-term.**
  - Moodle integration: assignments and deadlines from the course pages,
    probably through Moodle's web-service API or its calendar export.
  - ✅ Curriculum import: turn a course description pasted from USOS into
    class items, with Google Gemini doing the extraction (see 5.2).
  - Phone app (React Native, Expo), alongside the PWA: a home-screen widget,
    reminders and longer Google sessions, sharing the model, store and sync
    with the web app. Design and open questions in `docs/phone_app.md`.
  - RSS feed client: a reader pane for course, blog and release feeds.
    Fetching feeds needs a CORS proxy or a small backend, which this
    serverless app avoids today, so it needs a design decision first.
- **Planned.** Class photos (5.3) and tasks from a prompt (5.4).

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
| `1`–`6` | Home / Week (journal) / Calendar / Projects / Work / Settings |
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

### 5.2 Curriculum import ✅

Paste a course description, for example the "Pełny opis" section from USOS,
and get one item per lecture or topic, with the original wording kept.
Sample inputs and the output we expect from them live in
`docs/curriculum-import/` and double as evaluation fixtures.

**Flow**
1. In the project panel: **import curriculum…** → paste the text (any
   language; the examples are Polish). Without an API key the dialog links
   to Settings → Gemini.
2. The app calls the Gemini API with the prompt and response schema below.
3. **Review screen** before anything is created:
   - an editable table of topics;
   - the model's warnings;
   - every correction the model reports;
   - a "not verbatim" flag on any title or description that isn't found in
     the pasted text (whitespace-insensitive). This catches paraphrasing.
4. Choose the granularity:
   - **one item per topic** (e.g. "Pisanie prac naukowych"), or
   - **one item per lecture number** ("5. Pisanie prac naukowych", …). A
     lecture listed under several topics becomes one item titled with both
     ("8. Pisanie prac naukowych / Etyka"). This is the default when every
     topic has lecture numbers.
5. The import creates `kind: 'class'` items with the title above, notes =
   description, and an estimate (1.5 h by default, editable), in the group
   picked on the review screen when the project has groups (the one last
   imported into by default, as for USOS).
   It can be undone in one step. `courseNotes`, if ticked, is appended to the
   project's description under "Course notes".

**Gemini call**
- Endpoint: `models/<model>:generateContent`, with a current Gemini Flash
  model that is configurable in Settings.
- Use structured output: `responseMimeType: 'application/json'` plus a
  `responseSchema`.
- Temperature 0.
- API key: entered by the user in Settings → Gemini and stored only in that
  browser's localStorage, never in the app data, so it isn't exported or
  synced. It is sent in the `x-goog-api-key` header, not the URL. The API
  accepts browser (CORS) requests, so no proxy is needed.
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
- **Linking to the USOS timetable.** Should imported lectures be matched to
  USOS timetable events in order, so each gets its `heldOn` date
  automatically?

### 5.3 Class photos (planned)

Agreed design; not built yet.

Photos of the board or slides, attached to a course (any project). Android
only: in Chrome and the installed app. iPhone isn't supported.

**Storage: Google Drive only**
- Photos need Drive sync connected. They use the same `drive.file`
  permission, so nothing new is asked for. Without Drive, the Photos tab
  offers **Connect**.
- **Layout:** `Dashboard photos / <project id> / <photo id>.jpg`, with
  thumbnails in `Dashboard photos / <project id> / thumbnails / <photo id>.jpg`.
  The project id is the project's UUID, which never changes, so renaming a
  course keeps its folder. Folders and files are found by app properties,
  not by name.
- **As taken:** photos are uploaded full size, with all their metadata,
  location included. Large ones use Drive's resumable upload.
- **Thumbnails:** about 400 px JPEGs, made on the phone and uploaded next to
  the photos.
- **No copy on the device:** thumbnails and photos are fetched from Drive
  when shown and dropped afterwards.
- **Per-photo details** (when it was taken, the caption, the transcript)
  live on the Drive file itself (app properties and description), not in
  the app data. The data model doesn't change: a course's photos are the
  files in its folder. (Agreed.) So everything about photos, even a
  course's photo count, needs a connection; offline, the Photos tab says
  so.

**Adding photos:** only photos already taken, picked from the phone's
gallery. The app doesn't take photos itself.
- **Add photos** (on Home, and in a course's Photos tab) picks many photos
  at once.
- Each is matched to the course whose class was on when it was taken (from
  the USOS timetable or the class's session on the calendar). The photo's
  own time is used, or the file's.
- A review comes first: "12 → Operating Systems, 8 → Networks, 3
  unmatched". You pick a course for the unmatched ones; from a course's
  tab, they start in that course.
- Nothing is uploaded before you confirm. The photos stay in the gallery,
  so an upload interrupted by a lost connection can just be retried.
- **Android share sheet:** the installed app is a share target, so Gallery →
  Share → Dashboard opens the same review.

**Viewing**
- A **Photos** tab in the project panel, next to Items, Description and
  Log: thumbnails by day, newest first.
- Clicking one opens a full-screen viewer: swipe or arrow keys, caption,
  and delete with Undo. Deleting moves the file to Drive's trash, and Undo
  restores it.

**Gemini transcription**
- **Transcribe** on a photo sends it to Gemini (the key and model from 5.2).
  It returns the board or slide as Markdown, with formulas as LaTeX.
- The text is shown under the photo, editable, and saved as the photo's
  description in Drive. **Add to course notes** appends it to the project's
  description under a dated heading.
- It runs only when clicked, and the dialog says the photo goes to Google.

**Export**
- **Export with photos** (Settings): a ZIP with the data file and every
  photo, laid out as in Drive, plus an index naming the course of each
  project id.
- **Download photos** (a course's Photos tab): a ZIP of that course's
  photos.
- Both download from Drive, so they need a connection. Android can't stream
  a download to disk, so a large export comes in parts.

**Security:** no new Google permission. The page's content policy allows
`blob:` images. Photos go only to Drive, and to Gemini when transcribing.

**Not now:** taking photos in the app, shrinking photos or removing their
location, a copy on the device, iPhone, attaching photos to tasks, PDF export. Other files (e.g.
PDF slides) maybe later.

### 5.4 Tasks from a prompt (planned)

Agreed design; not built yet.

A general form of the curriculum import (5.2).

1. In the project panel, **from a prompt…** opens a dialog.
2. You say what you want, for example "one task per lecture below, 2h
   each, due the day before the next one" or "the problem sets in this
   list, due Fridays".
3. You paste any material: a curriculum, a list of lectures, an assignment
   schedule.
4. The LLM returns tasks as structured JSON: title, kind, due date,
   estimate, group and notes, plus warnings.
5. They're shown in the review dialog the curriculum import already has.
   There you edit or untick rows, or ask for changes in words ("estimates
   1h", "drop the labs") and get a revised list. The request sends the
   current list along with the change.
6. Confirming adds them as tasks in one undoable step; nothing is added
   before that.

Same Gemini key, model and privacy note as 5.2.

## 6. Engineering

- **Code style:** ESLint with the rules of Google's `gts` (Google TypeScript
  style), copied into `eslint.config.js` rather than installed (the package's
  setup tool pulls in a dependency with an unfixed advisory), plus React's
  hooks rules. Two deviations, both documented there: `== null` is allowed
  (as the style guide itself allows), and named function expressions are
  allowed for `memo(function Name…)`. Prettier with gts's settings.
- **Data schema:** `proto/dashboard/data.proto` (protobuf) describes the
  stored data; `npm run proto:generate` writes the TypeScript for it to
  `src/gen/`. Generated code isn't committed: it is regenerated before every
  `dev`, `build`, `typecheck` and `test` run. The data is stored as protobuf
  binary (`storage/codec.ts`), with protobuf's JSON form beside it as a
  read-only copy for people that the app never reads. Never renumber, retype
  or reuse a field or enum value (mark removed ones `reserved`); code must
  cope with enum values it doesn't know. Adding a field is safe: older
  versions keep fields they don't know when they save. Any change older
  versions can't handle raises `SCHEMA_VERSION`; they refuse such data and ask
  to be updated. A field that can be unset is marked `optional`, message
  fields included (proto3 tracks their presence anyway, so there it only
  documents it); an enum is unset at its `*_UNSPECIFIED` value instead.
  `buf lint` checks the schema's style. The app's records are
  the generated messages: new ones are made with `create()`, which also
  checks that nested records are messages.
- **Changing the data model:** every build must read what the released app
  (`main`) wrote, with the same meaning.
  - **Adding optional fields** that older versions can ignore is the easy
    case: no version change.
  - **A change older versions can't handle** (they would misread or drop
    something) raises `SCHEMA_VERSION` in `storage/codec.ts` by one and adds
    the step from the previous version to `storage/migrations.ts`
    (`MIGRATIONS[n]` upgrades version n to n + 1).
    - Data is upgraded step by step as it's read (`checked()` in the codec),
      which covers this device's copy, the sync base, the file on Drive and
      imports. It's saved in the new version with the next save.
    - Older versions refuse the new data and ask to be updated, instead of
      misreading it.
    - A test fails if a version has no step.
  - **Steps are deterministic:** the same input gives the same output, with
    ids derived from the data, never random or from the clock. This
    device's data, its sync base and the Drive file are upgraded
    separately, and the merge must see what they share as the same.
  - **Fields a step reads stay in the schema,** marked
    `[deprecated = true]`: the app no longer writes them, but data saved
    before the step still has them.
  - **Once no such data should be around,** a separate change deletes those
    fields from the code and marks their numbers and names `reserved`. Old
    exports may still contain them, and the JSON import rejects keys it
    doesn't know, so that change keeps such files importable.
- **Checks:** `npm run lint`, `format:check`, `proto:lint`, `typecheck`,
  `test`, `build`.
  The **Checks** workflow runs them on every pull request with a read-only
  token and no secrets; it can never deploy.
- **Deploy:** the **Deploy** workflow builds and publishes to GitHub Pages
  only from `main`. The build job can only read; only the deploy job (which
  runs no repository code) can publish. The `github-pages` environment must
  be limited to `main` in the repository settings, since the site's origin
  holds the app's data and is trusted by the Google OAuth client. For the
  same reason this must stay the account's only Pages site: every Pages site
  of an account shares the `<user>.github.io` origin (see the README's Deploy
  section).
- **Changes** go in small, focused pull requests, stacked when they build on
  each other.
