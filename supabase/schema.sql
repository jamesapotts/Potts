-- =====================================================================
-- Our Life — database setup
-- Run this ONCE in Supabase → SQL Editor → New query → paste → Run.
-- It is safe to run again later (it won't erase anything).
--
-- BEFORE YOU RUN IT: change the two email addresses in STEP 1 to the
-- emails James and Keith will sign in with.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1. Who is allowed in.  ✏️  EDIT THE TWO EMAILS BELOW  ✏️
-- Only accounts whose email is on this list can see or change anything,
-- even if someone else manages to create an account.
-- ---------------------------------------------------------------------
create table if not exists public.household_members (
  email        text primary key check (email = lower(email)),
  display_name text not null check (display_name in ('James', 'Keith'))
);

insert into public.household_members (email, display_name) values
  (lower('james@example.com'), 'James'),
  (lower('keith@example.com'), 'Keith')
on conflict (email) do update set display_name = excluded.display_name;

-- Nobody can read or change this list from the website; only you, here in Supabase.
alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;


-- ---------------------------------------------------------------------
-- STEP 2. Helper checks used by the rules below.
-- ---------------------------------------------------------------------
create or replace function public.is_household_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.my_member_name()
returns text language sql stable security definer set search_path = '' as $$
  select m.display_name from public.household_members m
  where m.email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

revoke all on function public.is_household_member() from public, anon;
revoke all on function public.my_member_name()     from public, anon;
grant execute on function public.is_household_member() to authenticated;
grant execute on function public.my_member_name()     to authenticated;


-- ---------------------------------------------------------------------
-- STEP 3. The shared data table.
-- Every task, event, grocery, meal, project, reminder, idea and workout is one row.
-- The details live in "data" so new fields can be added later without database changes.
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id          text primary key check (char_length(id) between 1 and 100),
  type        text not null check (type in ('Task','Event','Grocery','Meal','Project','Reminder','Idea','Workout')),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 20000),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create index if not exists items_updated_at_idx on public.items (updated_at);

-- Keep updated_at / updated_by accurate no matter what the browser sends.
create or replace function public.items_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end;
$$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.items_touch();


-- ---------------------------------------------------------------------
-- STEP 4. Security rules (Row Level Security).
-- Signed-in household members can read, add and edit everything.
-- Strangers (not signed in, or not on the list in STEP 1) get nothing.
-- Deleting from the app marks a row deleted=true, so mistakes can be recovered here.
-- ---------------------------------------------------------------------
alter table public.items enable row level security;

drop policy if exists "household can read"   on public.items;
drop policy if exists "household can add"    on public.items;
drop policy if exists "household can edit"   on public.items;

create policy "household can read" on public.items
  for select to authenticated using (public.is_household_member());

create policy "household can add" on public.items
  for insert to authenticated with check (public.is_household_member());

create policy "household can edit" on public.items
  for update to authenticated using (public.is_household_member()) with check (public.is_household_member());

revoke all on public.items from anon;
revoke delete, truncate on public.items from authenticated;
grant select, insert, update on public.items to authenticated;


-- ---------------------------------------------------------------------
-- STEP 5. Live sync: tell Supabase Realtime to broadcast changes to this table.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- Done!  Optional: recover something deleted in the app
--   select id, type, data->>'title' as title, updated_at from public.items
--   where deleted order by updated_at desc;
--   update public.items set deleted = false where id = 'PASTE-ID-HERE';
-- ---------------------------------------------------------------------
