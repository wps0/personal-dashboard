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

- **Home** (`#/`): a 3-day calendar, the planned sessions for those days, and
  a project overview sorted by the nearest deadline.
- **Week** (`#/week`): the bullet journal. Mon–Fri on top, then Sat, Sun and
  the backlog.
  - Drag a backlog item onto a day to plan time. Drag it onto another day too
    to split it (e.g. 1h today + 1h tomorrow).
  - Checking a session off logs its hours; click the number to correct them.
  - Unchecked sessions from past days show up under **missed**.
  - Drop a session on the backlog to unschedule it.
  - Click the week label to jump to any week.
- **Calendar** (`#/calendar`): Google-Calendar-style Day / 3-day / Week /
  Month views, with a mini month and layer toggles in the sidebar.
  - Click the grid to create an event of the default length (set in Settings),
    or drag to select any length in 15-minute steps. A floating card opens next
    to the selection.
  - Click the all-day row for an all-day event.
  - Drag blocks to move them; drag a block's bottom edge to resize it.
  - Sessions without a time sit in the all-day row; drag them onto the grid to
    time-block them.
  - Hatched areas are reserved time (sleep, work), set in Settings.
- **Projects** (`#/projects`): cards with progress rings. Click one to open its
  items, overview doc and progress log in a side panel. Drag the divider to
  resize the panel; double-click a log entry (or use ✎) to edit it. **+ bulk**
  creates "Lecture 1…13" in one go.
- **Task overlay**: click any task, anywhere, for its details, sessions and
  notes.
- **Capacity**: each day's "planned/capacity" badge opens the breakdown
  (planning window − events + adjustments) and ± / fixed controls for that
  day.
- **Settings**:
  - Planning windows, the global adjustment and reserved time per weekday
    (changes apply from today; past days don't change).
  - Areas, JSON export/import, reset.
  - The header icon switches the theme (auto / light / dark).

## Deploy

`.github/workflows/deploy.yml` builds and publishes `main` to GitHub Pages.
Enable it once under repo Settings → Pages → Source: **GitHub Actions**.

## Code map

| Path | What |
|---|---|
| `src/model/` | Types, date/time helpers, selectors (progress, backlog, missed), capacity rules, block layout, sample data |
| `src/store.ts` | Zustand store: all mutations, cascading deletes |
| `src/ui.ts`, `src/theme.ts` | Transient UI state (open overlays), theme preference |
| `src/storage/` | `Storage` interface, IndexedDB implementation, import validation |
| `src/views/` | Home, Week, Calendar, Projects (+ side panel), Settings |
| `src/components/` | TimeGrid, MonthGrid, event editor, task overlay, mini month, date/time pickers, capacity badge |
| `src/components/ui/` | Radix-based Select and Popover wrappers |

**Performance notes.** Components subscribe to the narrowest store slice
they need. Text fields buffer keystrokes and write to the store after a pause.
A component that owns a dnd-kit `DndContext` must not subscribe to data,
because when it re-renders, every draggable re-renders too.
