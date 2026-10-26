# Phone app (React Native): design

**Status:** proposal, not started. A long-term goal. Nothing here is built yet.

## Recommendation

- **In addition to the PWA, not instead of it.** The PWA keeps working on
  every device: desktop, phone, and an iPhone, where it is the only free
  option. The phone app adds what a web app can't do (below).
- **Expo (React Native), Android first.** React Native's own docs recommend
  starting with a framework, and Expo is the usual one. The app shares the
  data model, store, undoable actions, Drive sync and Google API code with the
  web app; only the UI and a few platform adapters are new.
- **Installed from GitHub Releases**: a signed APK built from `main`, no Play
  Store needed. For Poland this keeps working after Google's developer
  verification arrives (2027) with a free "limited distribution" account (see
  Getting it onto the phone).
- **iPhone only if it's worth $99 a year** (Apple Developer Program, for
  TestFlight). Otherwise the iPhone stays on the PWA.
- **Start with a 1–2 day spike** that answers the open questions, above all
  whether the phone can see the Drive sync file (see Open questions), before
  any phone UI is written.

## What a phone app adds

| | PWA (today) | Phone app |
|---|---|---|
| Install | Add to Home screen | APK (Android), TestFlight (iPhone) |
| Offline | Yes (service worker) | Yes |
| Home-screen widget (today's sessions, work logged vs target) | No | Yes |
| Reminders (deadlines, a session starting) | No: needs a push server, which this serverless app doesn't have | Yes: scheduled on the phone (`expo-notifications`), no server |
| Share a link or text into a new task | Android: possible with Web Share Target (not built yet) | Yes (share sheet) |
| Sync in the background | Only while the app is open | Sometimes (`expo-background-task`; the OS decides when) |
| Google session | 1 hour, then Reconnect | About a week (refresh token, see Security) |
| USOS direct iCal link | Only if USOS allows cross-site requests (CORS) | Always (no CORS outside the browser) |
| Data kept by the system | Asked for (`navigator.storage.persist`) | App storage is never evicted |

If widgets and reminders don't matter, the phone items on the roadmap (5,
"Next — UX rework") improve the PWA for much less work.

## Getting it onto the phone

### Android

- **Sideloading:** a release APK, signed with the app's key, downloaded from
  a GitHub Release. The browser needs "Install unknown apps" once. An update
  is a newer APK signed with the same key, installed over the old one.
- **Developer verification:**
  - Since 30 September 2026, certified Android devices in Brazil, Indonesia,
    Singapore and Thailand install only apps from registered developers.
    The rest of the world follows from 2027.
  - A free **limited distribution** account (an email address, no ID or fee)
    registers an app for up to 20 devices, which is enough for a personal app.
  - `adb install` and Google's "advanced flow" still install unregistered
    apps.
- **Play Store:** not needed. It costs $25 once, and its internal testing
  track takes up to 100 testers.

### iPhone

- **Apple Developer Program ($99 a year):** TestFlight builds (each expires
  after 90 days) or ad-hoc installs.
- **A free Apple ID with Xcode on a Mac:** the app stops working after 7 days
  and must be installed again.
- **EU alternative app marketplaces:** these also need the developer program.
- So on an iPhone the PWA is the practical choice.

## Architecture

One repository, as npm workspaces. Moving the shared code is one mechanical
PR, made when phone work starts, not before:

```
packages/core/   proto + generated code, model/, store, actions, sync/,
                 storage/codec, google/{api,drive,request,events}, usos/, curriculum/
apps/web/        today's Vite app: UI, IndexedDB, browser sign-in, service worker
apps/phone/      the Expo app: UI, file storage, native sign-in, widget, reminders
```

| Part | Web app today | Phone app |
|---|---|---|
| Data schema | `proto/dashboard/data.proto`, protobuf-es | Same: the same binary format and the same `SCHEMA_VERSION` rules (6) |
| Model, selectors, capacity, work log | `src/model/` | Shared as is: no browser APIs |
| Store, undoable actions | `store.ts`, `actions.ts`, `toast.ts` (Zustand) | Shared; only the toast UI is new |
| Local storage | IndexedDB (`storage/storage.ts`) and autosave | One file in the app's storage (`expo-file-system`), same codec, written to a temporary file and renamed. `single_tab` isn't needed |
| Drive sync | `sync/`: three-way merge, conflicts, runner | Shared. It runs when the app comes to the foreground, when it's back online, and on a timer while open |
| Google APIs | `google/api.ts`, `drive.ts`, `request.ts` (`fetch`) | Shared |
| Sign-in | Google Identity Services in the browser (`google/auth.ts`) | New adapter: OAuth for installed apps with PKCE (`expo-auth-session`), same scopes, asked for only when the feature is on |
| USOS | `usos/` | Shared |
| UI | React DOM, Tailwind, Radix, dnd-kit | New: React Native components, NativeWind (Tailwind-like classes), `react-native-gesture-handler` and Reanimated for dragging |

Platform checks for the spike:
- protobuf-es needs `TextEncoder`, `TextDecoder` and `BigInt` on Hermes (React
  Native's JavaScript engine); add a polyfill if one is missing.
- The date and time formatting in `model/dates.ts` uses `Intl`; a test
  compares its output with the web app's.

## Phone UI, first version

Made for the phone, not a port of the desktop layout:

- **Tabs:** Today, Calendar, Projects, Work, Settings.
- **Today:** the day's sessions with checkboxes, missed sessions, the next
  deadlines, and **Log as planned**.
- **Calendar:** day and 3-day views, with time blocks and Google events
  (read-only). A long press starts a drag.
- **Projects:** a list of projects; a project's tasks by group (folds sync
  too); long press to move a task to a group.
- **Quick add (+):** a task, or a time block for one.
- **Widget:** today's next sessions, and the work logged against the week's
  target.
- **Reminders:** before a deadline and when a session starts, scheduled from
  the data on the phone.
- **Later, or never, on the phone:** the week journal grid, curriculum
  import, and most of Settings (the first version has sign-in, sync and
  theme).

## Security

The web app's rules carry over:

- **Scopes:** the calendar's read-only scopes only while the calendar is
  connected, and `drive.file` only while sync is on. No write access to the
  calendar, and never the full Drive scope.
- **OAuth client:**
  - An Android client in the same Google Cloud project, registered with the
    app's package name and its signing key's SHA-1.
  - The consent screen stays in Testing, so refresh tokens expire after 7
    days: a weekly sign-in instead of an hourly Reconnect.
  - Tokens live in the Android Keystore (`expo-secure-store`) and are revoked
    on sign-out.
- **Builds and secrets:**
  - The signing key (and an Expo token, if EAS is used) are secrets of a
    release environment limited to `main`, like the Pages deployment.
  - Pull requests build without secrets and never publish.
  - Each release has the APK and its SHA-256.
- **No WebView with remote content.** Markdown is rendered with native
  components, using the same allow list as `sanitize.ts`.
- **The Gemini key** lives in secure storage.

## Open questions (the spike)

1. **Can the phone see the sync file?**
   - `drive.file` covers files "created or opened by the app". Google doesn't
     say whether an Android client in the same Cloud project counts as the
     same app as the web client, and community reports disagree.
   - The spike signs in with an Android client and looks for the file by its
     app property.
     - **If it finds it:** nothing more to do.
     - **If not:** the phone signs in through the web client in a browser
       tab (Custom Tabs) and gets the token back through an App Link on the
       app's own domain. That needs the custom subdomain from the roadmap.
     - **Not an option:** the full Drive scope, refused on purpose.
2. **Google sign-in in Testing mode on Android:** the consent screen, and
   whether refresh tokens really last 7 days.
3. **protobuf-es on Hermes:** decode a real export, encode it again, and
   compare the bytes.
4. **Widget and reminders with Expo:** which need a development build or
   config plugins. Widgets on an iPhone need a small Swift (WidgetKit) part.

## Plan

1. The spike, then decide whether to go on.
2. Move the shared code to `packages/core` (no change in behaviour; CI checks
   both apps).
3. Phone v0: Today and Calendar, read-only, from the synced data.
4. Editing: tick off sessions, log work, add tasks and time blocks, undo.
5. Widget and reminders.
6. Release workflow (a signed APK from `main`), and a limited distribution
   registration before verification reaches Poland in 2027.

**Cost:**
- **Android:** free. EAS Build's free plan has 15 Android builds a month, or
  build locally with Gradle.
- **iPhone:** $99 a year.

## Sources (checked October 2026)

- Android developer verification: [rolling out to all developers](https://developer.android.com/blog/posts/android-developer-verification-rolling-out-to-all-developers-on-play-console-and-android-developer-console),
  [June 2026 update](https://android-developers.googleblog.com/2026/06/android-developer-verification.html)
- Expo plans: [docs.expo.dev/billing/plans](https://docs.expo.dev/billing/plans/)
- Drive scopes: [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- Drive app data: [Store application-specific data](https://developers.google.com/workspace/drive/api/guides/appdata)
