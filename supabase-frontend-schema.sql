-- YUGYM normalized schema draft for admin/member/coach apps.
-- Run only after backing up the current Supabase project.
-- This does not replace the current app_state demo sync table.

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  line_id text,
  gender text,
  birthday date,
  level text not null default '新朋友',
  registered_at date not null default current_date,
  last_active_at timestamptz,
  wallet_amount integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  level text,
  phone text,
  status text not null default '在職',
  clock_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  ticket_type text,
  duration_minutes integer not null default 60,
  capacity_rule jsonb not null default '{}'::jsonb,
  time_rule jsonb not null default '{}'::jsonb,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_buckets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  ticket_type text not null,
  label text not null,
  source text not null default 'purchase',
  total_count integer not null default 0,
  used_count integer not null default 0,
  remaining_count integer not null default 0,
  expires_at date,
  price_per_class integer not null default 0,
  is_bonus boolean not null default false,
  installment_group_id uuid,
  installment_index integer,
  installment_total integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_adjustments (
  id uuid primary key default gen_random_uuid(),
  ticket_bucket_id uuid references public.ticket_buckets(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  adjustment_type text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  reason text,
  operator_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete set null,
  course_type text not null,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  coach_id uuid references public.staff_members(id) on delete set null,
  status text not null default 'booked',
  note text,
  series_id uuid,
  series_slot_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_members (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  ticket_bucket_id uuid references public.ticket_buckets(id) on delete set null,
  class_number integer,
  class_total integer,
  checked_in_at timestamptz,
  checkin_reward_given boolean not null default false,
  created_at timestamptz not null default now(),
  unique (booking_id, member_id)
);

create table if not exists public.recharge_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  plan_name text not null,
  ticket_type text not null,
  payment_method text,
  amount_due integer not null default 0,
  wallet_used integer not null default 0,
  amount_paid integer not null default 0,
  installment_mode text not null default 'none',
  installment_index integer,
  installment_total integer,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  source_app text not null,
  reward_ticket_bucket_id uuid references public.ticket_buckets(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (booking_id, member_id)
);

create table if not exists public.staff_clock_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  source_app text not null default 'coach',
  note text
);

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  coach_id uuid references public.staff_members(id) on delete set null,
  training_date date not null default current_date,
  summary text,
  items jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.staff_members enable row level security;
alter table public.courses enable row level security;
alter table public.ticket_buckets enable row level security;
alter table public.ticket_adjustments enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_members enable row level security;
alter table public.recharge_records enable row level security;
alter table public.checkins enable row level security;
alter table public.staff_clock_records enable row level security;
alter table public.training_records enable row level security;

-- RLS policies should be added after login roles are decided.
-- Recommended roles:
-- admin: full access.
-- member: own member profile, own tickets, own bookings, own checkins, own recharge requests.
-- coach: own schedule, own clock records, assigned training records.

