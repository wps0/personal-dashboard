# Personal Dashboard

All ongoing projects (university, work, personal) in one place: progress rings,
deadlines, and a one-screen bullet-journal week where you plan hours per day.
See [SPEC.md](SPEC.md) for the full design.

**Status: v1, a local-only UI.** Data lives in your browser (IndexedDB).
Google Drive sync, Google Calendar and USOS import come in v2.

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
./scripts/dev-container.sh            # dev server → http://localhost:5173
./scripts/dev-container.sh npm test   # any other command
```

To remove everything it created, run
`podman volume rm dashboard-node-modules && podman rmi docker.io/library/node:22`.

On first launch, choose **Load sample data** to explore, or create empty areas.

## How it works

- **Projects** (`#/projects`): projects grouped by area. Each card shows a
  progress ring, X/Y items done, and the next deadline. Each project chooses
  its own progress mode: checklist, hours (spent / estimate) or manual.
- **Project page**: items (lecture, assignment, exam, task) with status, due
  date and estimate; a markdown overview doc; and a timestamped progress log.
  Use **+ bulk** to create e.g. "Lecture 1…13" in one go.
- **Week** (`#/week`): Mon–Fri on top, then Sat, Sun and the backlog.
  - Drag a backlog item onto a day to plan time. Drag it to another day too
    to split it (e.g. 1h today + 1h tomorrow). Each slice has its own hours.
  - Checking a slice off logs its planned hours as spent. Click the number to
    correct the actual hours.
  - **✓✓** marks the whole item complete. That is independent of its slices.
  - Unchecked slices from past days show up under **missed** in the backlog.
    Drag them to a new day.
  - Drop a slice back on the backlog to unschedule it.
  - The day header shows planned / capacity hours. Set capacity in Settings.
- **Settings**: daily capacity, areas, JSON export/import, reset.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `main` to GitHub Pages.
Enable it once under repo Settings → Pages → Source: **GitHub Actions**.

## Code map

| Path | What |
|---|---|
| `src/model/` | Types, date helpers, pure selectors (progress, backlog, missed), sample data |
| `src/store.ts` | Zustand store: all mutations, cascading deletes |
| `src/storage/` | `Storage` interface, IndexedDB implementation, import validation |
| `src/views/` | Week, Projects, ProjectDetail, Settings |
| `src/components/` | Progress ring, inline editors, markdown |
