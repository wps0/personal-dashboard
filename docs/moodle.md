# Moodle integration: research

**Status:** research, not started. The roadmap's long-term "Moodle
integration" (SPEC 5). Nothing here is built yet.

## Recommendation

- **Deadlines from Moodle's calendar export (iCal)**, read the way the USOS
  timetable is (SPEC 4.2): the export link subscribed in Google Calendar,
  which the app already reads. Each deadline becomes an assignment task with
  its due date, in the course's project, after a review.
- **No web-service token.** Moodle's API is easy to call from the browser,
  but its token is the mobile app's: it can submit assignments and send
  messages as you. It isn't read-only (see Why not the API).
- **Usable today, without code:** paste Moodle's Timeline or Upcoming events
  into Tasks from a prompt (SPEC 5.4). Or subscribe to the export in Google
  Calendar, and the deadlines show on the calendar as Google events (not
  tasks).

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

## Why not the API

- **Not read-only.** The only token a student can get is for the Moodle app's
  service, which includes `mod_assign_save_submission`,
  `mod_assign_submit_for_grading` and `core_message_send_instant_messages`.
  Kept in this app's localStorage on the shared `wps0.github.io` origin (see
  the own-subdomain TODO in SPEC 5), anyone who can run script there could
  submit work or send messages as you. A read-only token needs a custom
  service, which only site admins can create.
- **SSO sites can't hand it to a web page.** With a USOS (CAS) login,
  `token.php` doesn't work, and the app's SSO login redirects to
  `<scheme>://token=<base64>`, which only an installed app can receive.
- **What it would add:** live data, and only the deadlines still to do. That
  is worth having in the phone app (`docs/phone_app.md`), which can receive
  the SSO redirect and keep the token out of a web origin.

## The import (proposal)

It follows the USOS import (SPEC 4.2) almost step for step.

1. **Source** (Settings → Moodle): one of your Google calendars, the
   Moodle export subscribed there ("From URL" in Google Calendar). A direct
   link, as USOS has, would be blocked by CORS on a standard Moodle. An
   `.ics` file picked from disk works too, refreshed by hand.
2. **Deadlines only:** events without a length (`DTSTART` = `DTEND`).
   Events with a length (meetings, lectures) are left out; USOS covers
   classes.
3. **Course → project:** each project picks its Moodle course from the
   short names found (`CATEGORIES`), the way a project has its USOS course
   pattern.
4. **One task per deadline:**
   - kind Assignment, titled with the event's name, editable in the review;
   - due date the event's local date, with the time in the notes ("due
     23:59");
   - notes from the description;
   - known by its `UID`, so it isn't offered twice.
   - **A deadline at 00:00 is due the day before:** it ends that day. Moodle
     sites often use midnight.
5. **Reviewed, never silent:** "N new deadlines from Moodle · Review", as
   for USOS: ticked ones become tasks, unticked ones are remembered as
   skipped, and the whole review is one undo step.
6. **Moved deadlines:** when a known `UID` comes back with another date
   (an extension), offer to move the task's due date. This is also a review,
   never automatic.

**Data format:** backward compatible, as SPEC 2 requires.
- `ItemSource` gets `string moodle_event = 2;` in its oneof.
- A new `MoodleSettings` message holds the source and the skipped events.
- `Project` gets an optional Moodle course.

**Quizzes** can have an "opens" and a "closes" event, and both have no
length, so both look like deadlines. The review shows both; untick the
"opens" one.

## Open questions

- **Which Moodle, and is the export on there?** Look for Calendar → Import
  or export calendars → Export calendar. The site couldn't be reached from
  the sandbox this was written in.
- **Does Google Calendar take the link?** It should: the link needs no
  login. Google refetches it every ~8–24h, so an extension shows up within a
  day.
- **The site's language:** event names are translated. Only the review
  shows them, so nothing depends on it, unless the "is due" part is to be
  cut from titles.

## Plan

Small PRs, each checked in the browser like the USOS import:

1. Parse deadlines from iCal (the USOS parser's reading of `VEVENT`s, with
   `CATEGORIES`) and from Google events. Unit tests with an exported
   calendar.
2. Settings → Moodle: the Google calendar source and "Check" (the courses
   found).
3. Project: its Moodle course.
4. The review and the import, with the proto fields above.
5. Moved deadlines.

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
