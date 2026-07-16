-- YUGYM booking system cloud sync table.
-- Paste this into Supabase SQL Editor and run it once.

create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "Allow public read app state" on public.app_state;
create policy "Allow public read app state"
on public.app_state
for select
to anon
using (id = 'yugym-booking-system-v1');

drop policy if exists "Allow public insert app state" on public.app_state;
create policy "Allow public insert app state"
on public.app_state
for insert
to anon
with check (id = 'yugym-booking-system-v1');

drop policy if exists "Allow public update app state" on public.app_state;
create policy "Allow public update app state"
on public.app_state
for update
to anon
using (id = 'yugym-booking-system-v1')
with check (id = 'yugym-booking-system-v1');
