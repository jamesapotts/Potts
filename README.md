# Our Life — James + Keith

A private household app for tasks, calendar, meals, groceries, projects, Brain Dump and workouts.
It runs on GitHub Pages (free hosting) and uses **Supabase** (free database + sign-in) so James's iPhone
and Keith's Android stay in sync.

> **You can upload it right away.** Until you finish Part 2, the site runs in **local mode**:
> it works, but entries are saved only in the browser you're using (like V1).

---

## What's in this folder

| File / folder | What it is | Will you edit it? |
|---|---|---|
| `index.html` | The page layout | Rarely |
| `styles.css` | Colors, fonts, spacing | Rarely |
| `app.js` | Everything the app does | Rarely |
| `config.js` | **Your two Supabase connection values** | **Yes, once (Part 2, step 5)** |
| `supabase/schema.sql` | Database setup script | **Yes, once (two emails)** |
| `lib/supabase.js` | Supabase's official library (stored here so the app doesn't depend on another website) | Never |
| `manifest.json`, `icons/` | Home-screen app icon | Never |
| `docs/HANDOFF.md` | Notes for future AI/developer work | Optional |

---

## Part 1 — Put the site on GitHub Pages (about 10 minutes)

If your `our-life` repository already exists, skip to step 3.

1. Go to **github.com** → green **New** button (or **+** → **New repository**).
2. Name it `our-life`, leave it **Public**, click **Create repository**.
   *(Public is fine: the code contains no passwords or secrets. Your data lives in Supabase, behind sign-in.)*
3. In the repository, click **Add file → Upload files**.
4. Unzip the download on your computer. Open the unzipped folder, **select everything inside it**
   (all files *and* the `lib`, `icons`, `supabase`, `docs` folders) and drag it all into the GitHub page.
   - If an old `index.html` is already there, it gets replaced. That's expected.
   - Make sure `index.html` sits at the **top level** of the repository, not inside another folder.
5. Scroll down and click **Commit changes**.
6. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**,
   pick **main** and **/ (root)**, and click **Save**.
7. Wait 1–2 minutes and refresh that page. GitHub shows your address, something like
   `https://YOUR-USERNAME.github.io/our-life/`. Open it. You should see the app with a "Local mode" note.

---

## Part 2 — Turn on sign-in and sync (about 20 minutes, one time)

### Step 1. Create a free Supabase project
1. Go to **supabase.com** → **Start your project** → sign up (signing in with GitHub is easiest).
2. Click **New project**. Name it `our-life`. Create a **database password**, save it in your
   password manager (you won't need it day to day), pick the region closest to Ohio (US East), and click **Create**.
3. Wait a minute or two while it sets up.

### Step 2. Create the database tables and security rules
1. Open the file `supabase/schema.sql` from this folder in any text editor (Notepad or TextEdit is fine).
2. Near the top, replace `james@example.com` and `keith@example.com` with the **real emails** you'll each sign in with.
3. In Supabase, click **SQL Editor** in the left sidebar, then **New query**.
4. Paste the **entire** file and click **Run**. You should see "Success. No rows returned."
   (It's safe to run again if you make a mistake.)

### Step 3. Create your two accounts
1. In Supabase, open **Authentication → Users**.
2. Click **Add user → Create new user**. Enter James's email (exactly the same one you put in step 2) and a password.
   Tick **Auto Confirm User** if you see it. Click **Create user**.
3. Repeat for Keith.

### Step 4. Turn off public sign-ups
In **Authentication**, find the sign-in settings (labelled **Sign In / Providers**, or similar),
turn **off** "Allow new users to sign up", and save.
*(Even if someone did create an account, the rules from step 2 give them nothing. This just closes the door completely.)*

### Step 5. Connect the website to Supabase
1. In Supabase, open **Project Settings** (gear icon) and find:
   - **Project URL**: looks like `https://abcdefghij.supabase.co`
   - **API Keys → Publishable key**: starts with `sb_publishable_…`
     *(Older projects show an "anon public" key instead. That works too.)*
2. ⚠️ **Do NOT copy the "secret" or "service_role" key.** That one must never go on a website.
   (The app refuses to start if you paste it by mistake.)
3. On GitHub, open your repository → click `config.js` → the **pencil icon** (Edit).
4. Paste the two values between the quotes:
   ```js
   window.OUR_LIFE_CONFIG = {
     supabaseUrl: 'https://abcdefghij.supabase.co',
     supabaseKey: 'sb_publishable_xxxxxxxxxxxx'
   };
   ```
5. Click **Commit changes**. Wait 1–2 minutes.

### Step 6. Sign in
1. **James first, in the browser you've been using for V1** (so old entries can come along):
   open the site, sign in, and when it asks *"Copy these items into your shared account?"*, tap **OK**.
   The built-in sample entries (Call dentist, Chicken tacos, etc.) are skipped automatically.
2. Keith signs in on his phone. He'll see the same household data.
3. Make a test: James adds a grocery item. It should appear on Keith's screen within a second or two.

### Step 7. Add it to your home screens (recommended)
- **iPhone (Safari):** open the site → **Share** button → **Add to Home Screen** → **Add**.
- **Android (Chrome):** open the site → **⋮ menu** → **Add to Home screen** (or **Install app**).

The home-screen app opens full-screen like a normal app. You'll sign in once more inside it (on iPhone, the
home-screen app keeps its own storage separate from Safari). Your data is in the cloud, so nothing is lost.

---

## Everyday notes

**Sync dot (top right):** green = synced · yellow = saving · gray = offline (changes wait and upload when you reconnect) · red = can't reach the database (it keeps retrying).

**Add to Calendar:** tap it on any event to download a calendar file, then open the file and confirm.
- *iPhone:* Safari offers to download the file. Open it (from the download prompt or the Files app → Downloads) and tap **Add All**.
- *Android:* open the downloaded `.ics` file and choose Google Calendar (or your calendar app).
- "Export upcoming" on the Calendar page puts all future events in one file.
- This is a **one-time copy**. If you later edit the event in Our Life, add it to your calendar again.

**Deleting:** you'll always be asked to confirm, and you get a few seconds to tap **Undo**. Deleted items are also
kept in the database (marked deleted), so they can be recovered from Supabase if needed (see the end of `schema.sql`).

**Backups:** ⚙︎ Settings → **Download backup** saves everything as a file. Do this every month or so; the free
Supabase plan doesn't include the automatic backups that paid plans have. **Restore from backup** adds/updates
items from a backup file and never deletes anything.

**Free plan pause:** Supabase pauses free projects after about a week with no use, and emails you a warning first.
Normal daily use keeps it awake. If it ever pauses, log in to supabase.com, open the project, and click **Resume project**.
Your data is kept.

---

## Updating the site later

1. On GitHub, open the file you want to change → pencil icon → edit → **Commit changes**,
   or use **Add file → Upload files** to replace files with new versions.
2. GitHub Pages republishes automatically in 1–2 minutes (check progress under the repository's **Actions** tab).
3. On your phone, close and reopen the app (or pull down to refresh). Browsers can hold the old version for a few minutes.

You never need to touch Supabase again for normal updates. If a future version needs database changes,
it will come with its own SQL file and instructions.

---

## Troubleshooting

| You see | Fix |
|---|---|
| "Local mode" note won't go away | `config.js` is still empty, or the change hasn't published yet. Wait 2 minutes and refresh. |
| "Email or password is incorrect" | Check the account under Supabase → Authentication → Users. You can reset the password there. |
| "This account is not on the household list" | The sign-in email doesn't exactly match an email in `schema.sql`. Fix the email in the file and run it again (step 2). |
| "Could not check your account… database not set up" | Step 2 wasn't run, or it showed an error. Run `schema.sql` again. |
| Red sync dot | The Supabase project may be paused (see above), or you're on bad Wi-Fi. Your changes are kept on the phone and upload once it's reachable. |
| "Stop… secret key" screen | You pasted the secret key. Replace it with the **publishable** key in `config.js` right away. Then, in Supabase, create a new secret key and delete the old one, since it was published. |
| Page looks unstyled or blank | A file is missing or inside the wrong folder. The repository's top level must contain `index.html`, `styles.css`, `app.js`, `config.js` and the `lib` and `icons` folders. |

---

## How the security works (plain English)

- **Sign-in** is handled by Supabase. Passwords never touch this code or GitHub.
- **The household list** in the database (two emails) decides who gets in. The database itself checks this on
  every read and write, so it can't be bypassed from the website.
- **The publishable key in `config.js` is meant to be public.** It only identifies your project; by itself it grants
  nothing beyond what the rules allow, and strangers get nothing.
- **Both of you can see and edit everything.** James / Keith / Shared means "who it's for", not privacy, as decided.
  Private records could be added later if you ever want them.
- The page blocks scripts from anywhere other than your own site, and everything you type is displayed as plain text,
  never run as code.
