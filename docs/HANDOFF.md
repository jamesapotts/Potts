# OUR LIFE — AI / DEVELOPER HANDOFF (V2)
Updated: November 18, 2026. Supersedes the V1 handoff; all V1 design decisions still apply.

## How to continue
Attach this file plus the repository files (or the ZIP). Inspect the real code before changing it. Preserve all features and
the approved look. Run the tests (see "Testing") before delivering. Never break existing user data: migrate it explicitly.

## Fixed product decisions (do not reverse without asking the user)
- Calm, friendly look: cream background, navy text (#27364A), sage/blue/gold tints, rounded cards. Not spreadsheet-like or corporate.
- Contrast: light surfaces = dark text, dark surfaces = white text. Task filter pills: unselected = white bg + navy text,
  selected = navy bg + white text. This regressed several times in V1 — never regress it.
- Owner tags: James = light blue, Keith = light gold, Shared = sage, all with navy text.
- Grocery department is ALWAYS chosen manually (Produce; Dairy & Eggs; Meat & Seafood; Bakery & Bread; Frozen; Pantry;
  Snacks & Drinks; Household Essentials; Personal Care; Pet; Other). Auto-categorizing was tried and rejected.
- Calendar is a phone-style month grid (Sun–Sat) with dots, tap-a-day agenda, + Event for the selected day. Not a long list.
- Every event has "Add to Calendar" (.ics). It is a one-way export, not live sync. Never claim two-way sync.
- Brain Dump: thought + category (Cleaning, Home, Errands, Personal, Work, Shopping, Money, Meals, Ideas, Other), grouped by category.
- Delete always asks for confirmation (V2 adds an Undo toast and soft delete).
- Workout Log: works for cardio and strength; calories are user-entered estimates.
- Ownership (James/Keith/Shared) means "who it's for". **The user explicitly chose NO privacy separation**: both members
  read and edit everything. Don't add private records unless asked.

## Architecture (V2)
Static site, no build step: `index.html`, `styles.css`, `app.js`, `config.js`, `lib/supabase.js` (vendored supabase-js 2.119.1 UMD),
`manifest.json`, `icons/`. Hosted on GitHub Pages. A strict Content-Security-Policy (script-src 'self') is in index.html, so:
no inline scripts, no `onclick=` attributes (all events use delegation via `data-act` attributes), no eval.

Modes:
- **Local mode** (config.js empty): localStorage key `ourLifeV1`, same `{items, brain}` format as V1 (V1 data loads unchanged).
- **Cloud mode** (config.js has URL + publishable key): email/password sign-in, data in Supabase table `public.items`.
  Device cache `ourLifeCloudCache`; unsent edits queued in `ourLifePending` (survives reload/offline); prefs in `ourLifePrefs`.
  On the first cloud sign-in in a browser holding V1 data, the user is offered a one-time copy (fresh UUIDs; seeded demo items skipped).
  Settings also has "Copy older entries from this browser".

Sync: every change goes through `commit()` → local state + cache + pending queue → `upsert` to Supabase. Realtime
(`postgres_changes` on `items`) applies other device's changes live; full refetch on app focus/online. Local pending edits win
over server copies until uploaded. Last write wins. Deletes are soft (`deleted = true`).

Database (`supabase/schema.sql`, idempotent): `household_members(email, display_name)` allowlist (no client access);
`is_household_member()` and `my_member_name()` security-definer functions; `items(id text pk, type, data jsonb, deleted,
created_at, updated_at, updated_by)` with trigger-maintained timestamps; RLS select/insert/update for members only; no delete grant;
table added to `supabase_realtime` publication. Item fields live in `data` jsonb so new fields need no migration.

Item fields: id, type (Task|Event|Grocery|Meal|Project|Reminder|Idea|Workout), title, owner, date (YYYY-MM-DD), notes, done,
createdAt; Event: startTime, endTime, location; Grocery/Idea: category; Project: progress (0–100; V1 numeric notes migrated);
Workout: duration, calories, sets, reps, weight. `normalize()` in app.js validates every record from any source.

## What changed from V1
Fixed: phone nav hid Home + Projects / Brain Dump / Workout (now 4 tabs + More); .ics DTEND before DTSTART when no end time
(now +1 h) and untimed events are all-day; .ics line folding; Reminders were saved but never shown (now on Tasks page + Home);
undated meals vanished (now "Meal ideas"); owner tags all the same gray; viewer reset on reload; Quick Add kept stale values;
overdue tasks disappeared from Home (now shown as Overdue); five stacked CSS override layers merged into one stylesheet.
Added: edit for every item; undo; soft delete; backup download/restore (JSON); Export upcoming (.ics); meal week navigation and
per-day "+ Add dinner"; multiple meals per day; workout duration and per-person filter; project progress field; "Clear checked"
groceries; sign-in, shared database, live sync, offline queue; home-screen install (manifest/icons); last page restored on reload.

## Testing
`tests/` holds Playwright scripts (Python). Serve the folder (`python3 -m http.server 8765`) and run:
- `local_test.py` — 94 checks, phone + desktop: navigation, all 8 types, migration from V1 data, edit/undo/delete, filter contrast,
  .ics validity (parsed with the `icalendar` library), backup round trip, no JS/CSP errors.
- `cloud_test.py` — 21 checks using the real supabase-js against a simulated Supabase (auth, REST, RPC, Realtime websocket)
  with two separate browsers: live sync both ways, soft delete, offline queue + recovery, stranger refused, secret-key guard.
- schema.sql was run twice on PostgreSQL 16 with a Supabase-like auth shim: members read/write; stranger with an account sees 0 rows
  and cannot insert; anon is denied; hard DELETE denied.
Not yet verified on real devices: .ics import on iPhone/Android, real Supabase project end-to-end, iOS home-screen app.

## Suggested next steps
P1: Confirm .ics import on both real phones; recurring events and reminders/alerts in .ics; optional time-zone-aware export.
P1: Brain Dump "turn into task/event" with confirmation (never automatic).
P2: Saved recipes linked to meals and groceries; grocery quantities; project room/budget/next action/subtasks;
Bills, Shopping, Work, Lists pages from the original Excel blueprint; offline-first service worker (careful with update caching).
