# Personal Dashboard

All ongoing projects (university, work, personal) in one place: progress rings,
deadlines, and a one-screen bullet-journal week where you plan hours per day.
See [SPEC.md](SPEC.md) for the full design.

**Status: v1.2, a local-only UI.** Data lives in your browser (IndexedDB), and
calendar events are local for now. Google Drive sync, Google Calendar and USOS
import come in v2; keyboard shortcuts come next (see the SPEC roadmap).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (model logic, storage)
npm run build      # typecheck + production build into dist/
npm run lint       # ESLint: Google TypeScript style (gts rules) + React hooks rules
npm run format     # Prettier with gts settings (format:check only reports)
```

### Without installing Node (Podman)

`scripts/dev-container.sh` runs everything in a throwaway rootless Podman
container (`node:22`). Nothing is installed on the host, and `node_modules`
lives in a named volume instead of your checkout.

```sh
./scripts/dev-container.sh            # production build → http://localhost:5173 (use this day to day)
./scripts/dev-container.sh dev        # dev server with hot reload (for working on the code)
./scripts/dev-container.sh npm test   # any other command
```

The dev server runs React in development mode, so the UI is about 3× slower.
For everyday use, serve the production build (the default above, or
`npm run build && npm run preview`).

To remove everything it created, run
`podman volume rm dashboard-node-modules && podman rmi docker.io/library/node:22`.

On first launch, choose **Load sample data** to explore, or create empty areas.

## How it works

- **Home** (`#/`): a 3-day calendar (‹ › to move a day at a time, or pick a
  date), the planned sessions for those days, and a project overview sorted by
  the nearest deadline.
- **Week** (`#/week`): the bullet journal. Mon–Fri on top, then Sat, Sun and
  the backlog. It always runs Monday–Sunday; the week start in Settings →
  Calendar is for the calendar and its mini months.
  - Drag a backlog item onto a day to plan time. Drag it onto another day too
    to split it (e.g. 1h today + 1h tomorrow).
  - Checking a session off logs its hours; click the number to correct them.
  - Unchecked sessions from past days show up under **missed**.
  - Drop a session on the backlog to unschedule it.
  - Click the week label to jump to any week.
- **Calendar** (`#/calendar`): Google-Calendar-style Day / 3-day / Week /
  Month views, with a mini month and layer toggles in the sidebar. It opens in
  the default view set in Settings.
  - Click the grid to create an event of the default length (set in Settings),
    or drag to select any length in 15-minute steps. A floating card opens next
    to the selection.
  - Click the all-day row for an all-day event.
  - **Repeat** (in the event card) makes an event repeat daily, weekly, every
    weekday, or on a custom rule. Dragging one occurrence changes that day
    only; the card asks whether a change is for this event, this and the
    following ones, or all of them.
  - Drag blocks to move them; drag a block's bottom edge to resize it.
  - Sessions without a time sit in the all-day row; drag them onto the grid to
    time-block them.
  - Hatched areas are reserved time (sleep, work): reserved events, created
    with the quick-create card's **Reserved** tab and usually repeating. Drag
    a block's label (top right) to move it, or its edges to resize it, for
    that day only; click the label for its card.
- **Work** (`#/work`): the work log, weeks in one scrolling list that opens
  on this week. Log the stretches you
  actually worked each day (or **Log as planned**, from the day's reserved
  Work time) and see the week's hours against its target (default in
  Settings → Work log, or one of the week's own). A small card on Home shows
  today and the week at a glance.
- **Projects** (`#/projects`): cards with progress rings. Click one to open its
  items, description (Markdown) and progress log in a side panel; the
  description also shows beside the items (above them on narrow screens).
  Drag the divider to resize the panel; double-click a log entry (or use ✎)
  to edit it. **+ bulk** creates "Lecture 1…13" in one go. **+ group** makes
  a folder for items (e.g. all classes); its ⋯ menu moves every ungrouped
  item of a kind into it. Drag a group by its grip (left of the name) to
  reorder the groups. Click a task to select it, Shift-click another to
  select the tasks in between too, or Ctrl/Cmd-click to add one; drag them
  onto a group to move them together.
- **Task overlay**: click any task (double-click in the project panel) for
  its details, sessions and notes.
- **Undo**: deleting or completing something shows a toast with **Undo**
  (bottom left). **Ctrl+Z** also undoes moves, resizes and check-offs.
- **Keyboard**: Google-Calendar-style shortcuts.
  - `j` / `k`: next / previous period; `t`: today; `g`: go to date.
  - `1`–`6`: pages (Home, Week, Projects, Calendar, Work, Settings);
    `d` / `x` / `w` / `m`: calendar views; `c`: create.
  - Arrow keys select blocks; then `Enter` opens, `Space` toggles done, and
    `Delete` removes.
  - Press `?` for the full list.
- **Capacity**: each day's "planned/capacity" badge opens the breakdown
  (planning window − events + adjustments) and ± / fixed controls for that
  day.
- **Settings**:
  - The first day of the week, the default calendar view and event length.
  - Capacity: planning windows and the global adjustment (changes apply
    from today; past days don't change).
  - Areas, export/import (protobuf's JSON form), reset.
  - The header icon switches the theme (auto / light / dark).

## Google Calendar (read-only)

The app can show your Google calendars next to your plan. It requests only two
read-only scopes, `calendar.events.readonly` and
`calendar.calendarlist.readonly`, so it can read events and your calendar list
but never create, change or delete anything (it can't read calendar settings or
sharing either). It asks for them only when you connect the calendar, so using
just Drive sync never grants calendar access. There's no backend: the browser talks to Google directly, and the
access token lives in the current tab for up to an hour.

One-time setup (free, about 5 minutes):

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project and enable the **Google Calendar API**.
2. **OAuth consent screen:**
   - User type: **External**, publishing status: **Testing**.
   - Add yourself as a test user.
   - Add the scopes `.../auth/calendar.events.readonly` and
     `.../auth/calendar.calendarlist.readonly`.
3. **Credentials → Create credentials → OAuth client ID:**
   - Application type: **Web application**.
   - Authorized JavaScript origins: every address you open the app from, e.g.
     `http://localhost:5173` and `https://<you>.github.io`.
   - No redirect URI is needed.
4. Give the app the Client ID (it isn't a secret). Either:
   - set the repository variable `GOOGLE_CLIENT_ID` (Settings → Secrets and
     variables → Actions → Variables), and the deploy builds it in, so every
     device has it; or
   - paste it in **Settings → Google Calendar** on each device (this wins
     over a built-in one; clear the field to go back to it).

   Locally, `VITE_GOOGLE_CLIENT_ID=… npm run dev` does the same as the
   variable.

Google shows an "unverified app" warning for apps in testing mode. That's
expected for a personal client.

## Google Drive sync

To use the dashboard on several devices, turn on **Settings → Google Drive
sync** on each of them. The data goes into one file in your Drive,
`personal-dashboard.binpb` (protobuf), and every device keeps its own copy in the browser,
so the app still works offline. The app asks for `drive.file` only when you
turn sync on: access to the files it creates, nothing else in your Drive.

After every upload the app also writes `personal-dashboard.json`, the same
data as readable JSON, so you can look at it if something breaks in the app.
It's only a copy: the app never reads it, and edits made to it are lost.

It uses the same OAuth client as the calendar. In the same Cloud project,
enable the **Google Drive API** and add the scope `.../auth/drive.file` to the
consent screen.

Sync runs a few seconds after an edit, when you come back to the tab, and every
two minutes. Changes made on two devices are merged record by record. If both
changed the same field, this device's value is kept until you review it:
**Review** on the toast, or in Settings → Google Drive sync, lets you pick
either device's version for each one. Sessions last an hour, so after that sync waits
until you click **Connect**.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `main` to GitHub Pages.
Set it up once:

1. Repo Settings → Pages → Source: **GitHub Actions**.
2. Repo Settings → Environments → `github-pages` → Deployment branches and
   tags: only `main`.

**Keep this the only GitHub Pages site on your account.** The browser keeps
the app's data, the Gemini key and the Google token per origin, and Google
trusts the origins you authorise. Every Pages site of an account is served
from the same `https://<you>.github.io` origin, so any other one (or anything
compromised in it) could read the dashboard's data and get Google tokens with
your client ID. So:

- don't turn on Pages in any other repository of this account;
- don't create a `<you>.github.io` repository (a user site);
- if you ever need another site, move this app to its own custom domain first
  (Settings → Pages → Custom domain, verified, with Enforce HTTPS) and
  authorise only that origin in the OAuth client.

## Code map

| Path | What |
|---|---|
| `src/model/` | Types, date/time helpers, selectors (progress, backlog, missed), capacity rules, block layout, sample data |
| `src/store.ts` | Zustand store: all mutations, cascading deletes |
| `src/ui.ts`, `src/theme.ts` | Transient UI state (open overlays), theme preference |
| `proto/` | The data schema (protobuf). The TypeScript for it is generated into `src/gen/` (not committed) before `dev`, `build`, `typecheck` and `test` |
| `src/storage/` | `Storage` interface, IndexedDB implementation, import validation |
| `src/sync/` | Drive sync: three-way merge, sync engine, runner and triggers |
| `src/views/` | Home, Week, Calendar, Projects (+ side panel), Settings |
| `src/components/` | TimeGrid, MonthGrid, event editor, task overlay, mini month, date/time pickers, capacity badge |
| `src/components/ui/` | Select (lightweight listbox) and Popover (Radix) wrappers |
| `src/toast.ts`, `src/actions.ts` | Toasts, undo history (`withUndo`, `undoLast`), undoable user actions |
| `src/shortcuts.ts`, `src/keyboard.ts` | Key → action mapping and help text; global handler, page navigation targets, spatial block selection |

**Performance notes.** Components subscribe to the narrowest store slice
they need. Text fields buffer keystrokes and write to the store after a pause.
A component that owns a dnd-kit `DndContext` must not subscribe to data,
because when it re-renders, every draggable re-renders too.
