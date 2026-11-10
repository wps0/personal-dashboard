# UX review: research and audit (November 2026)

**Status:** findings and a fix plan. Some are fixed in open PRs (marked);
the rest are proposals. It builds on the click counts in SPEC 3.9.

## Summary

The app is fast, its navigation is visible, and changes on desktop are
undoable. On a phone it is a desktop interface made smaller, and that is
where most of the problems are. The ten that matter most:

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | On a phone, a drag, resize or tick-off can't be undone: they make no toast, and Ctrl+Z is the only other undo | 3 major | proposal |
| 2 | Adding an event on a phone: the card was pushed about and covered by the keyboard | 3 major | fixed in #270, #271 |
| 3 | Half the tap targets on a phone are under 24 px, and 91% are under 44 px, the frequent ones included (week checkboxes 15 px) | 3 major | proposal |
| 4 | 80% of the text on Home and the calendar on a phone is 10–11 px | 3 major | proposal |
| 5 | Meaning and instructions live in hover tooltips that phones never show (58 on the phone screens) | 3 major | proposal |
| 6 | Hidden gestures: double-tap opens a task, long press drags; nothing on screen says so | 2 minor | proposal |
| 7 | Deleting an area (with its projects) can't be undone at all; elsewhere deletion asks "Are you sure?" and is undoable too | 3 major | proposal |
| 8 | Labels that need learning: ASG/EXM/CLS, "✓✓", hours without a unit, "8h left" next to "7h planned" | 2 minor | proposal |
| 9 | The week journal and the project panel waste the first screen on phones | 2 minor | proposal |
| 10 | Faded text below contrast minimums (2.4–3.0:1) | 2 minor | proposal |

## How it was evaluated

- **Heuristic evaluation** against Nielsen's ten heuristics
  [1] and Shneiderman's eight golden rules [2], with severity on Nielsen's
  0–4 scale (3 major: important to fix; 2 minor: low priority; 1 cosmetic).
- **Cognitive walkthroughs** [3] of everyday tasks: add an event, plan a
  task, tick off a session, add a task, log work, undo a mistake.
- **Measurement**, by script on a production build with the sample data:
  - 8 screens (Home, Week, Projects, a project, Calendar, Month, Work,
    Settings) and the task card;
  - a phone (Pixel 9a: 412×915 CSS px, touch, Android Chrome) and a
    desktop (1440×900), each in the dark and light themes;
  - for each: tap target sizes, contrast of every text element (colours
    composited as drawn, opacity included), font sizes, controls shown
    only on hover, information only in `title` tooltips, truncated text,
    overflow;
  - keyboard focus visibility, and input latency with the browser's Event
    Timing API at 4× CPU slowdown.
- **Limits:** one evaluator, and no real users. Nielsen and Landauer's model
  [4] says a single evaluator finds only part of the problems; 3–5
  evaluators, or a few usability tests with real users, would find more.
  The phone keyboard could only be simulated (by shrinking the viewport).

## What the research says

The principles the findings rest on, with the evidence behind them.

**Touch targets.** On a phone, pointing is a thumb, and about half of
phone use is one-handed [7]. Parhi et al. found that targets of about 9 mm
are needed for reliable one-handed thumb use [6]. The platforms set 44×44 pt
(Apple) and 48×48 dp (Material) as minimums [8]. WCAG 2.2 asks for at least
24×24 CSS px (2.5.8, level AA), or enough space around a smaller target, and
44 px at AAA (2.5.5) [9]. Fitts's law: smaller and farther targets take
longer to hit [5].

**Hover doesn't exist on touch.** Tooltips are a desktop pattern. NN/g:
don't put information needed to complete a task in a tooltip [11]. Controls
that appear only on hover are invisible on a phone.

**Hidden gestures need signifiers.** Drag-and-drop needs visible grab cues
and feedback, and an alternative [12]. Long press and double tap are
"hidden interactions": people find them by accident, if at all [22]. WCAG
2.2 (2.5.7, AA) asks that anything done by dragging also be possible with
single taps or clicks [10].

**Undo over "Are you sure?"** People click through warnings out of habit;
undo is what actually saves work (Raskin [15]). Both rule sets ask for easy
reversal of actions ([1] heuristic 3, [2] rule 6). For an undo snackbar,
Material's older guidance keeps it until the next unrelated action [16];
Angular Material advises against timing out snackbars that have an action,
for screen-reader users [17].

**Feedback and speed.** Response time limits: 0.1 s feels instant, 1 s keeps
the flow of thought, 10 s keeps attention [13]. Web vitals count an input as
responsive at 200 ms or less (INP) [14]. Animations: 100–500 ms, the
shortest that isn't jarring [20].

**Recognition rather than recall** ([1] heuristic 6), **consistency** (4),
**match with the real world** (2): words people know, units shown, the same
thing written the same way everywhere. **Progressive disclosure**: show
what most people need first, and the rest on request [19].

**Reading on a phone.** Material's body text is 14–16 sp; Apple's is
17 pt, with 11 pt as its smallest. Text must keep 4.5:1 contrast (WCAG 1.4.3);
on dark themes Material desaturates colours to keep it [21].

**The keyboard on Android.** Since Chrome 108 the keyboard shrinks only
the visual viewport [18]: anything positioned against the layout viewport
can end up under it.

**Navigation.** Visible navigation is found and used more than hidden
navigation (a hamburger), on phones and desktop [23]. The app's default,
tabs along the bottom, follows this.

**Planning, for a planner.** People underestimate how long their own work
takes: students predicted their theses in 34 days and took 56, and only
about 30% finished by their own date (Buehler, Griffin & Ross [24]).
Deciding when and where to do something (an implementation intention)
helps people follow through (d = 0.65 across 94 tests [25]; a 2024
re-analysis with bias corrections finds a smaller effect). For this app, a
session with a time (a time block) is likely to be kept more often than an
untimed one.

## Findings

Severity: 3 major (important), 2 minor, 1 cosmetic. "Phone" means the
Pixel 9a emulation; the numbers are from the measurement above.

### 1. On a phone, direct changes can't be undone (3)

Thirteen kinds of change are recorded quietly, without a toast: moving and
resizing sessions, events and reserved time, ticking a session off,
editing a session's time. On desktop, Ctrl+Z undoes them. On a phone there
is no Ctrl+Z, so a mistaken drag, which a long press on a scrolling
calendar makes easy, stays. Toasts with Undo disappear after 6 s and
don't pause while hovered or focused.

*Fix:* on touch devices, show the undo toast for quiet changes too, or add an
Undo button to the phone header while there's something to undo. Keep undo
toasts for about 10 s, pausing while hovered or focused. ([1] h3, [2] r6, [16])

### 2. Adding an event on a phone (3, fixed in #270 and #271)

The create card and event cards were desktop popovers beside their block.
The keyboard pushed them sideways and covered their bottom, Save included.
Time fields selected their text on a tap, which put Android's selection
handles over them. #270 makes them a sheet at the top, as tall as what the
keyboard leaves visible; #271 leaves a tapped time field empty, with the
time as its hint. ([18], [11])

### 3. Tap targets too small (3)

On the phone screens, 358 of 716 targets (50%) are under 24 px in one
dimension: they pass WCAG 2.5.8 only if nothing else is within 24 px. And
649 (91%) are under 44 px. The ones used most:

| Control | Size (px) |
|---|---|
| Week journal: tick a session off | 15×15 |
| Week journal: ✓✓ (complete the task), × (remove) | 27×19, 17×22 |
| Reserved time's label, which is also its drag handle | 35×14 |
| Capacity badges ("1h/1.5h") | 39–49×15 |
| All-day chips (deadlines, sessions) | ~110×17 |
| Project panel: task rows; its tabs | 168×18; ~50×19 |
| Work page: "+ time slot", "+ hours" | 81×22, 64×22 |
| Settings: planning window times | 62×18 |

*Fix:* for coarse pointers, give every control a hit area of at least
44×44 px (padding, or a transparent `::after`), without changing how it
looks on desktop. Checkboxes 20–24 px inside that. ([5]–[9])

### 4. Text too small on phones (3)

The body text is 13 px. On the phone, 80% of the visible text on Home and
the calendar is 10–11 px (event and session labels, capacity, chips), 48%
on Week, and 41% of all text elements across the screens. Material's body
text starts at 14 sp; Apple's floor is 11 pt for anything at all. ([21])

*Fix:* a phone type scale (below 640 px or on coarse pointers): 15–16 px
body, 13 px for secondary text, 12 px as the smallest. On the calendar's
blocks, show fewer details rather than smaller ones.

### 5. Meaning that lives only in tooltips (3)

Counted screen by screen, 58 `title` tooltips on the phone and 109 on
desktop say more than what's shown. Some are only hints, but these
carry meaning:
- "1h/1.5h" under each day means planned of capacity.
- "✓✓" means "mark the whole task complete".
- A task row opens on a double click.
- "Planned without a time: drag onto the grid to time-block it."
- Reserved time: "drag to move, drag its edges to resize".

On a phone none of this can be seen. ([11], [1] h6)

*Fix:* say it on screen:
- "1h of 1.5h", or a labelled bar;
- a word or an icon with a label instead of "✓✓";
- one-time hints that can be dismissed, for the gestures;
- a short help page ("How to…") reachable from Settings.

### 6. Hidden gestures (2)

On a phone, a double tap opens a task in the project panel (one tap only
selects it), and a long press starts a drag. Both work, but nothing hints
at them. The backlog's "Missed · drag to reschedule" names only the
gesture that is hardest on a phone: dragging from the bottom of a long list
to a day far above. ([12], [22], [10])

*Fix:*
- On touch, one tap opens a task; select with a long press or a "Select"
  button.
- Give rows and blocks a visible grip on phones.
- Add "Move to…" (Today / Tomorrow / pick a date) wherever dragging is the
  way to reschedule. The roadmap's **Plan ▾** idea (SPEC 5) does this.

### 7. Deleting: one can't be undone, others ask twice (3)

- Deleting an area deletes its projects, items and sessions. It asks with
  the browser's `confirm()` and then deletes directly, not through undo:
  Ctrl+Z then says "Can't undo: something changed since" and clears the
  undo history, so neither the area nor anything before it can be undone.
  With no projects, it doesn't even ask.
- Deleting a project asks with `confirm()` *and* is undoable: the question
  is redundant.
- Tasks, sessions and events are deleted at once, with Undo: the right
  pattern, but inconsistent with the two above.

*Fix:* make area deletion undoable and drop the `confirm()` from both
deletes, with an Undo toast as everywhere else. Keep a (styled) confirmation
only for replacing all data on import. ([15], [1] h3, h5)

### 8. Words, units and numbers (2)

- **Kind badges** "ASG", "EXM", "CLS", "TSK": abbreviations to learn. A
  small icon with the full word in the card would do. ([1] h2, h6)
- **Hours:** the week journal writes "1.5" and "2" with no unit, Home writes
  "1.5h", and the project list writes "0/7". Use "h" everywhere. ([1] h4)
- **"0h / 7h · 8h left"** in the task card: "left" is the estimate less
  hours *spent*, not less hours planned, so with 7h planned it reads as a
  contradiction. Say "8h to do · 1h not planned yet".
- **The project list's "Date" column** mixes due dates ("in 4d") with class
  dates ("2 Nov"). Mark which is which (a flag for due), or use two columns.

### 9. Space on the first screen (2)

- **Week, phone:** each day is a box with an empty "notes…" area of about
  150 px. A week is several screens long, and the backlog is at the
  bottom. *Fix:* collapse empty notes to one line on phones.
- **Week, desktop:** the day boxes are mostly empty, yet titles are cut off
  ("Assignment 2: sche…"). *Fix:* let titles wrap to two lines.
- **Project panel, phone:** the Items tab opens with the description block,
  which fills the first screen, and the Description tab shows it again.
  The status column takes a third of each row ("In prog…"). *Fix:* on
  phones, leave the description to its tab, and show status as a coloured
  dot that opens the menu. ([19])
- **Home, phone:** the calendar takes the first screen and squeezed the
  planned list to one line (fixed in #247). With the new per-device
  picker (#259), "Day" may suit a phone better than "3 days" as its default.

### 10. Contrast (2)

On the screens checked, 3.7% (phone) to 5.3% (desktop) of text elements
are below WCAG's 4.5:1 minimum:
- The dim colour at 60% opacity, 2.4–2.6:1: the mini month's days outside
  the month, and the project list's "· hours / · manual".
- Text of done sessions on the calendar, 3.0:1.
- In the light theme: times on event blocks (4.4:1), amber "in 4d" (4.35:1)
  and red overdue dates (4.37:1).

*Fix:* faded text that carries information at 4.5:1 or more; done items
faded less, with the strikethrough doing the work.

### Smaller things (1–2)

- **Calendar toolbar on phones:** "November 2026" wrapped onto two lines
  (fixed in #272).
- **Work page on phones:** buttons broke onto two lines (fixed in #273).
- **Time fields:** the list didn't follow what was typed, and the mouse
  could override the typed time (fixed in #264).
- **Long lists:** typing and adding tasks were slow on a project with 300
  tasks (fixed in #267).
- **3-day calendar on a phone:** columns are about 110 px wide, so event
  titles are cut off (5–11 per screen).
- **iPhone:** fields under 16 px make iOS Safari zoom in on focus. Android
  doesn't, but the app's 13 px fields would on an iPhone.

### What works (keep)

- Visible navigation: tabs along the bottom on phones by default [23].
- Undo with a toast for deletions and bulk changes, and Ctrl+Z on desktop.
- Keyboard shortcuts, and visible focus: 71 of 75 Tab stops checked show a
  ring; the rest are text fields, which change colour.
- Speed: opening an event card takes 144–216 ms at 4× CPU slowdown, about
  40–55 ms on a normal machine, well under the 200 ms that INP counts as
  good [14].
- Typed times with a list, inline editing, and read-only Google access.

## Task timing (KLM)

Keystroke-Level Model estimates for an expert [26]:
- K: a key or click, 0.2 s;
- P: pointing, 1.1 s;
- H: moving between mouse and keyboard, 0.4 s;
- M: a mental step, 1.35 s.

| Task (desktop) | Steps (SPEC 3.9) | Estimate |
|---|---|---|
| Plan a backlog task onto a day, by drag | M + P + drag | ~4 s |
| The same by clicks (card → add session → date) | 6 clicks, 3 decisions | ~12 s |
| Change a task's status | 3–4 clicks, 2 decisions | ~7–8 s |
| Add a task with due date and estimate | 8 actions + typing | ~20 s |

The roadmap's ideas (a Plan ▾ menu, a one-click status pill, quick add) would
cut the costliest of these to one or two actions.

## Fix plan

Small PRs, the most valuable first. S: under an hour, M: a few hours.

1. Undo on phones: toasts for quiet changes on touch, 10 s, paused while
   hovered or focused (S).
2. Deleting an area becomes undoable; no `confirm()` before undoable deletes
   (S).
3. Touch targets: a 44 px minimum hit area for coarse pointers (M).
4. A phone type scale (M).
5. What tooltips say, on screen: capacity, "✓✓", task kinds, hours with units
   (M).
6. On touch, a tap opens a task; "Move to…" where dragging is the only way
   (M).
7. Phones: empty day notes collapsed; the project panel without the
   description block; status as a dot (S).
8. Contrast of faded text (S).
9. "8h to do · 1h not planned yet", and due vs class dates (S).

Already in PRs: #247, #264, #267, #270, #271, #272, #273.

## Sources

1. Nielsen, J. (1994). *10 Usability Heuristics for User Interface
   Design.* https://www.nngroup.com/articles/ten-usability-heuristics/
2. Shneiderman, B. *The Eight Golden Rules of Interface Design.*
   https://www.cs.umd.edu/~ben/goldenrules.html
3. Wharton, C., Rieman, J., Lewis, C., Polson, P. (1994). The cognitive
   walkthrough method: a practitioner's guide. In Nielsen & Mack,
   *Usability Inspection Methods*, 105–140.
4. Nielsen, J., Landauer, T. K. (1993). A mathematical model of the finding
   of usability problems. INTERCHI '93.
   https://course.ccs.neu.edu/is4800/ssl/nielsen93.pdf
5. MacKenzie, I. S. (1992). Fitts' law as a research and design tool in
   human-computer interaction. *Human-Computer Interaction* 7, 91–139.
   https://www.yorku.ca/mack/hci1992.html
6. Parhi, P., Karlson, A. K., Bederson, B. B. (2006). Target size study for
   one-handed thumb use on small touchscreen devices. MobileHCI '06.
   https://doi.org/10.1145/1152215.1152260
7. Hoober, S. (2013). How do users really hold mobile devices? UXmatters.
   https://uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
8. TetraLogical (2022). Foundations: target sizes (Apple 44 pt, Material
   48 dp, WCAG). https://tetralogical.com/blog/2022/12/20/foundations-target-size/
9. W3C. Understanding SC 2.5.8 Target Size (Minimum), WCAG 2.2.
   https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
10. W3C. Understanding SC 2.5.7 Dragging Movements, WCAG 2.2.
    https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements
11. NN/g. Tooltip guidelines. https://www.nngroup.com/articles/tooltip-guidelines/
12. NN/g. Drag–and–drop: how to design for ease of use.
    https://www.nngroup.com/articles/drag-drop/
13. NN/g. The 3 response time limits in interaction design.
    https://www.nngroup.com/videos/3-response-time-limits-interaction-design/
14. web.dev. Interaction to Next Paint (INP). https://web.dev/articles/inp
15. Raskin, A. (2007). Never use a warning when you mean undo. A List Apart.
    https://alistapart.com/article/neveruseawarning
16. Material Design 2. Confirmation & acknowledgement.
    https://m2.material.io/design/communication/confirmation-acknowledgement.html
17. Angular Material. Snack bar: accessibility.
    https://material.angular.io/components/snack-bar
18. Chrome for Developers (2022). Prepare for viewport resize behavior
    changes coming to Chrome on Android.
    https://developer.chrome.com/blog/viewport-resize-behavior
19. NN/g. Progressive disclosure. https://www.nngroup.com/articles/progressive-disclosure/
20. NN/g. Executing UX animations: duration and motion characteristics.
    https://www.nngroup.com/articles/animation-duration/
21. Material Design 2. Dark theme. https://m2.material.io/design/color/dark-theme
22. GhostUI: unveiling hidden interactions in mobile UI (2026).
    https://arxiv.org/html/2601.19258
23. NN/g. Hamburger menus and hidden navigation hurt UX metrics.
    https://www.nngroup.com/articles/hamburger-menus/
24. Buehler, R., Griffin, D., Ross, M. (1994). Exploring the "planning
    fallacy". *JPSP* 67, 366–381.
    https://bear.warrington.ufl.edu/brenner/mar7588/Papers/buehler-et-al-1994.pdf
25. Gollwitzer, P. M., Sheeran, P. (2006). Implementation intentions and
    goal achievement: a meta-analysis. *Advances in Experimental Social
    Psychology* 38, 69–119.
    https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f
26. Card, S. K., Moran, T. P., Newell, A. (1980). The keystroke-level model
    for user performance time with interactive systems. *CACM* 23(7).
    https://en.wikipedia.org/wiki/Keystroke-level_model
