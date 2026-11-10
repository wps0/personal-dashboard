# Moodle integration: research

**Status:** research, not started; updated for moodle.mimuw.edu.pl. The roadmap's long-term "Moodle
integration" (SPEC 5). Nothing here is built yet.

**Site:** `moodle.mimuw.edu.pl`, which supports the Moodle app, so a
student can get a web-service token there.

## Recommendation

- **Deadlines from Moodle's web-service API, with your app token.** It's
  live, and it lists only what's still to do (unsubmitted assignments,
  quizzes not taken), with course, activity and link. Each deadline becomes
  an assignment task with its due date, in the course's project, after a
  review.
- **The token can do more than read** (see The token): the app calls only a
  short list of read functions, keeps the token on this device only, and
  never stores your password.
- **The calendar export stays the read-only fallback:** through Google
  Calendar, as for the USOS timetable (SPEC 4.2), should the token not work
  out.
- **Usable today, without code:** paste Moodle's Timeline into Tasks from a
  prompt (SPEC 5.4).

## What Moodle offers

Checked in Moodle 4.5's source (see Sources).

| | Calendar export (iCal) | Web services (REST API) |
|---|---|---|
| What the credential can do | Read your calendar, nothing else | Everything the Moodle app can: read courses and grades, also save and submit assignments, send messages |
| The credential | `authtoken` in the export link: `sha1(user id + password hash + site salt)`. A new password gives a new link | A token from `login/token.php` (needs a Moodle password) or from the app's SSO login |
| From this app in a browser (CORS) | No: `export_execute.php` sends no `Access-Control-Allow-Origin`. Through Google Calendar: yes | Yes: `webservice/rest/server.php` and `login/token.php` send `Access-Control-Allow-Origin: *` |
| SSO sites (e.g. logging in with USOS / CAS) | Works: the link doesn't need a login | `token.php` can't log in without a Moodle password. The SSO login hands the token to an app URL (`<scheme>://token=…`), which a web page can't receive |
| What it has | Every event you can see: assignment due dates, quiz opens and closes, course, group and site events | The same, plus whether you've submitted: `core_calendar_get_action_events_by_timesort` lists only what's still to do |
| Fresh | Each time it's fetched. Through Google: Google refetches every ~8–24h | Live |
| On by default | Yes (`enablecalendarexport`) | The app's service is on wherever the Moodle app works |

**The export link.** In Moodle: Calendar → Import or export calendars →
Export calendar. Choose the events (all, or courses only) and the range, then
"Get calendar URL". The range "custom" covers 5 days back to 365 days ahead
by default (site settings). "Recent and upcoming" covers 5 days back to 60
days ahead.

The link looks like
`https://<moodle>/calendar/export_execute.php?userid=…&authtoken=…&preset_what=all&preset_time=custom`.

**What an exported event looks like:**
- `SUMMARY`: the event's name in the site's language, e.g. "Lab 3 is due".
- `DESCRIPTION`: plain text.
- `DTSTART` = `DTEND` for a deadline: it has no length.
- `CATEGORIES`: the course's short name.
- `UID`: `<event id>@<host>`, which stays the same when the date moves.

The export doesn't say whether you've submitted. It also doesn't say what
kind of activity the event is for, except through the name.

## The token

**Getting it.** `login/token.php` with `service=moodle_mobile_app` and your
Moodle username and password returns `{"token": "…"}` (and
`Access-Control-Allow-Origin: *`, so a web page can ask). That is what the
Stack Overflow answer on reading the API as a student describes. Every
user may create this token (`moodle/webservice:createmobiletoken`, allowed
for all users by default). It needs a password login: with a USOS (CAS)
login, `token.php` can't sign you in. In the app:

- paste a token you got yourself, or
- **Get token**: a one-time form that sends your username and password
  straight to Moodle's `token.php` (POST, over HTTPS) and keeps only the
  token. The password is never stored or synced.

**What it can do.** It is the Moodle app's token, so beyond reading it can
save and submit assignments (`mod_assign_save_submission`,
`mod_assign_submit_for_grading`) and send messages
(`core_message_send_instant_messages`). A read-only token would need a
custom service, which only site admins can create.

**How the app keeps it small:**
- It calls only read functions, from a fixed list in the code:
  - `core_webservice_get_site_info`: who you are;
  - `core_enrol_get_users_courses`: your courses, for matching them to
    projects;
  - `core_calendar_get_action_events_by_timesort`: deadlines still to do.
- **On this device only:** localStorage, never in the synced data or
  exports, like the Gemini key (Settings → Gemini).
- **Revoking it:** a student usually can't see or reset the token in Moodle.
  The Security keys page needs `moodle/webservice:createtoken`, which by
  default only managers have. Clearing it in the app forgets it here.
  Revoking it at Moodle may need the site's admins.

**The risk that's left:** any script running on the app's origin can read
localStorage. Today that origin is the shared `wps0.github.io` (see the
own-subdomain TODO in SPEC 5), so moving to an own subdomain first lowers
the risk.

## The import (proposal)

It follows the USOS import (SPEC 4.2) almost step for step.

1. **Source** (Settings → Moodle): the site (`https://moodle.mimuw.edu.pl`)
   and the token (pasted, or from **Get token**). **Check** lists your
   courses. The fallback is a Google calendar with the Moodle export
   subscribed in it ("From URL" in Google Calendar); a direct export link
   would be blocked by CORS.
2. **Deadlines:** `core_calendar_get_action_events_by_timesort` from 5 days
   back on. It gives what's still to do, overdue included, each with its
   course, activity (`modulename`, `activityname`), due time (`timesort`)
   and link (`url`). Through the export: events without a length
   (`DTSTART` = `DTEND`).
3. **Course → project:** each project picks its Moodle course from your
   courses, the way a project has its USOS course pattern.
4. **One task per deadline:**
   - kind Assignment, or Exam for a quiz;
   - titled with the activity's name, editable in the review;
   - due date the deadline's local date, with the time in the notes ("due
     23:59") and the link to the activity;
   - known by its event id (the export's `UID` is `<event id>@<host>`), so
     it isn't offered twice.
   - **A deadline at 00:00 is due the day before:** it ends that day.
     Moodle's default due time is midnight.
5. **Reviewed, never silent:** "N new deadlines from Moodle · Review", as
   for USOS: ticked ones become tasks, unticked ones are remembered as
   skipped, and the whole review is one undo step.
6. **Moved deadlines:** when a known event comes back with another date (an
   extension), offer to move the task's due date. This is also a review,
   never automatic.
7. **Submitted:** a deadline that drops out of the list because you've
   submitted (rather than because it moved) can offer to mark its task
   done, in the same review.

**Data format:** backward compatible, as SPEC 2 requires.
- `ItemSource` gets `string moodle_event = 2;` in its oneof.
- A new `MoodleSettings` message holds the site, the source and the skipped
  events. The token is not in it: it stays on the device.
- `Project` gets an optional Moodle course id.

## Open questions

- **Does `token.php` accept your password on moodle.mimuw.edu.pl?** It does
  if you sign in to that Moodle with a username and password (a Moodle or
  LDAP account), not through USOS. The site couldn't be reached from the
  sandbox this was written in.
- **The site's language:** activity names are as the teacher wrote them;
  only the review shows them, so nothing depends on it.

## Plan

Small PRs, each checked in the browser like the USOS import:

1. A Moodle client: `token.php` and the three read functions, with the
   function list fixed, and readable errors (wrong token, site without the
   app service, offline). Unit tests with recorded answers.
2. Settings → Moodle: the site, the token (paste or **Get token**), and
   **Check** (your courses).
3. Project: its Moodle course.
4. The review and the import, with the proto fields above.
5. Moved and submitted deadlines.
6. If needed: the calendar export through Google Calendar as the fallback
   source.

## Sources (checked November 2026)

Moodle `MOODLE_405_STABLE` on GitHub (`github.com/moodle/moodle`):

- `calendar/export_execute.php`: its parameters and ranges, the headers it
  sends (no CORS), and the `VEVENT` fields.
- `calendar/lib.php`: `calendar_get_export_token`.
- `admin/settings/appearance.php`: export on by default; the custom range,
  5 days back and 365 ahead.
- `webservice/rest/locallib.php`, `login/token.php`:
  `Access-Control-Allow-Origin: *`.
- `admin/tool/mobile/launch.php`: the token is sent to
  `<urlscheme>://token=…`.
- `mod/assign/db/services.php`, `lib/db/services.php`: the app's service
  includes saving and submitting assignments, sending messages, and
  `core_calendar_get_action_events_by_timesort`.
- `lib/db/access.php`: `moodle/webservice:createmobiletoken` is allowed for
  every user; `moodle/webservice:createtoken` (the Security keys page) only
  for managers. `user/managetoken.php` checks the latter.
- `calendar/classes/external/event_exporter_base.php`,
  `event_action_exporter.php`: the fields of an action event.

Stack Overflow, "Getting information from the Moodle API as a student"
(question 44652206): getting a token from `login/token.php`.
