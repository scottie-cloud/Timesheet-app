-- Millewa Timesheet — Supabase schema
--
-- Paste this whole file into the Supabase SQL editor (Project → SQL editor → New query)
-- and click "Run". Idempotent — safe to re-run.
--
-- Security model: site is gated by Netlify password protection; inside the app,
-- staff identify themselves by picking a name + PIN. The Supabase anon key is
-- embedded in the client bundle and RLS policies below allow anon read/write
-- on the three app tables. Do NOT make this database public without the Netlify
-- password gate, and never ship the service_role key to the client.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.staff (
  name            text primary key,
  pin             text,                                  -- nullable; staff without a PIN can still be listed
  profile         jsonb       not null default '{}'::jsonb,  -- ordinaryWeeklyHours, employmentType, etc.
  sort_order      int                  default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.projects (
  name            text primary key,
  sort_order      int                  default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.timesheets (
  id              text primary key,                      -- the uid() generated client-side
  employee_name   text        not null,
  week_ending     date        not null,
  submitted_at    timestamptz,                           -- null = draft, non-null = submitted
  approval_status text,                                  -- 'pending' | 'approved' | etc, free-form
  data            jsonb       not null,                  -- full sheet object (days, jobs, leave, ...)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists timesheets_employee_name_idx on public.timesheets (employee_name);
create index if not exists timesheets_week_ending_idx   on public.timesheets (week_ending);

create table if not exists public.overtime_adjustments (
  id              text primary key,                      -- client-generated uid()
  employee_name   text        not null,
  adj_date        date        not null,                  -- 'date' is reserved; use adj_date
  hours           numeric     not null,
  note            text,
  adj_type        text        not null,                  -- 'add' | 'deduct'
  created_at      timestamptz not null default now()
);

create index if not exists ot_adj_employee_idx on public.overtime_adjustments (employee_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-update updated_at
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists staff_updated_at on public.staff;
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists timesheets_updated_at on public.timesheets;
create trigger timesheets_updated_at before update on public.timesheets
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────
-- Permissive policies for the anon role. The Netlify password is the real gate;
-- in-app, PINs restrict who can do what. If you later add real auth, tighten
-- these by checking auth.uid() / claims.

alter table public.staff                enable row level security;
alter table public.projects             enable row level security;
alter table public.timesheets           enable row level security;
alter table public.overtime_adjustments enable row level security;

-- Drop old policies if re-running
drop policy if exists "anon all"  on public.staff;
drop policy if exists "anon all"  on public.projects;
drop policy if exists "anon all"  on public.timesheets;
drop policy if exists "anon all"  on public.overtime_adjustments;

create policy "anon all" on public.staff
  for all to anon using (true) with check (true);

create policy "anon all" on public.projects
  for all to anon using (true) with check (true);

create policy "anon all" on public.timesheets
  for all to anon using (true) with check (true);

create policy "anon all" on public.overtime_adjustments
  for all to anon using (true) with check (true);
