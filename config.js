/* Our Life — connection settings
   ------------------------------------------------------------------
   Leave both values empty to run in LOCAL mode (data stays in one browser).
   Fill them in to turn on sign-in and shared sync (README.md, step 3).

   supabaseUrl  → Supabase: Project Settings → API (or Data API) → "Project URL"
   supabaseKey  → Supabase: Project Settings → API Keys → the PUBLISHABLE key
                  (starts with sb_publishable_ …  — an older "anon public" key also works)

   These two values are designed to be public, so it's fine that they are
   visible on GitHub. The database rules (schema.sql) are what keep strangers out.

   NEVER paste the "secret" or "service_role" key here. The app refuses to run if you do.
*/
window.OUR_LIFE_CONFIG = {
  supabaseUrl: '',
  supabaseKey: ''
};
