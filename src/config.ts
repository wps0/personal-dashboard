/**
 * @fileoverview Numbers to tune by hand: how much a list shows, calendar
 * sizes, how long things wait, stay cached or are kept. Each comment says
 * what it changes and where.
 *
 * Not here, on purpose: sizes that must match a CSS class (they sit next to
 * that class), the data format's schema version (storage/codec.ts; changing
 * it needs a migration) and lookup tables.
 */

// Week journal (views/week_view.tsx)

/**
 * Backlog rows shown at first, and added by each "Show more". Hundreds of
 * draggable rows take a second or more to draw, and the week grid redraws
 * them when the week changes.
 */
export const BACKLOG_ROWS = 50;
/** The same for the missed sessions above the backlog. */
export const MISSED_ROWS = 20;

// Work page (views/work_view.tsx)

/** Weeks shown before and after the one in focus when the page opens or jumps. */
export const WORK_WEEKS_BEFORE = 8;
export const WORK_WEEKS_AFTER = 4;
/** Weeks added at a time, scrolling near the top or the bottom. */
export const WORK_WEEKS_MORE = 8;

// Calendar (components/time_grid.tsx, components/month_grid.tsx)

/** Height of an hour in the calendar's time grid, in pixels. */
export const CALENDAR_HOUR_PX = 48;
/** The same on Home's three days. */
export const HOME_HOUR_PX = 44;
/** Items per day in the all-day row while it's collapsed. */
export const ALL_DAY_COLLAPSED_ITEMS = 2;
/** Entries a month view cell shows before "N more". */
export const MONTH_CELL_ENTRIES = 3;

// Toasts and undo (toast.ts)

/** How long a toast stays, without and with an Undo button. */
export const TOAST_MS = 3000;
export const TOAST_WITH_UNDO_MS = 6000;
/** Changes Ctrl+Z can go back. */
export const UNDO_STEPS = 50;

// Saving and Drive sync (storage/autosave.ts, sync/setup.ts)

/** Save to this browser this long after the last change. */
export const AUTOSAVE_DELAY_MS = 400;
/** Upload to Drive this long after the last edit. */
export const SYNC_AFTER_EDIT_MS = 3000;
/** While the tab is visible, look for changes from other devices this often. */
export const SYNC_POLL_MS = 2 * 60_000;
/** Coming back to the tab syncs, but not more often than this. */
export const SYNC_ON_RETURN_MIN_MS = 15_000;

// Fetched data (google/use_google_events.ts, usos/timetable.ts)

/** Google Calendar events are reused this long before they're fetched again. */
export const GOOGLE_EVENTS_FRESH_MS = 5 * 60_000;
/** The same for the USOS timetable. */
export const USOS_TIMETABLE_FRESH_MS = 30 * 60_000;

// Limits on what's read (usos/fetch.ts, curriculum/curriculum.ts)

/** A timetable is a few hundred kB; anything much bigger is the wrong link. */
export const USOS_ICAL_MAX_BYTES = 5_000_000;
/** In an imported curriculum, lecture numbers above this are taken as a mistake. */
export const CURRICULUM_MAX_LECTURE = 500;
/** The most lectures one curriculum topic can span. */
export const CURRICULUM_MAX_LECTURES_PER_TOPIC = 100;
