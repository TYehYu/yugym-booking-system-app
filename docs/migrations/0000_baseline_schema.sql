-- ============================================================
-- YUGYM baseline schema（0000）— enums + tables + FK + indexes
-- 由正式資料庫 rlpiomzplckzqnqrvrwc 於 2026-07-16 萃取重建
-- 用途：補回缺失的 migration 歷史；供測試環境重建 schema（不含任何真實資料）
-- 函式與 RLS 見 0001_functions_and_rls.sql
-- ============================================================
set check_function_bodies = off;

-- ========== 列舉型別（14） ==========
create type staff_role        as enum ('admin','coach','front_desk');
create type employment_type   as enum ('full_time','part_time','contractor','intern');
create type staff_status      as enum ('active','leave','inactive');
create type member_status     as enum ('active','inactive','suspended');
create type member_gender     as enum ('female','male','other','unspecified');
create type member_source     as enum ('google','instagram','facebook','referral','walkin','corporate','other');
create type ticket_category   as enum ('私人教練','小班肌力','自主訓練','體驗','運動按摩');
create type ticket_status     as enum ('usable','used_up','expired','refunded');
create type pay_status        as enum ('unpaid','paid','partial');
create type invoice_status    as enum ('none','issued');
create type ticket_log_action as enum ('grant','deduct','refund','adjust','expire');
create type booking_status    as enum ('booked','checked_in','completed','cancelled','no_show');
create type notify_recipient  as enum ('member','coach');
create type reward_status_enum as enum ('pending','issued','skipped','revoked');

-- ========== 資料表（25，含 PK / UNIQUE / CHECK；FK 後補） ==========

create table public.app_state (
  "id" text not null,
  "payload" jsonb not null,
  "updated_at" timestamp with time zone default now() not null,
  primary key (id)
);

create table public.member_level (
  "level" text not null,
  "label" text,
  primary key (level)
);

create table public.category (
  "id" text not null,
  "name" text not null,
  "color" text,
  "sort_order" integer,
  primary key (id)
);

create table public.employees (
  "id" text not null,
  "auth_id" uuid,
  "name" text,
  "nickname" text,
  "phone" text,
  "email" text,
  "role" staff_role default 'coach'::staff_role not null,
  "employment_type" employment_type default 'full_time'::employment_type,
  "pay_rate" numeric default 0,
  "is_manager" boolean default false,
  "is_supervisor" boolean default false,
  "manager_bonus" numeric default 0,
  "supervisor_bonus" numeric default 0,
  "hire_date" date,
  "status" staff_status default 'active'::staff_status,
  "invite_status" text,
  "invite_token" text,
  "created_at" timestamp with time zone default now(),
  "address" text,
  "emergency_name" text,
  "emergency_phone" text,
  "id_number" text,
  "bank_account" text,
  "birthday" date,
  "name_en" text,
  "must_setup" boolean default false,
  "emp_no" text,
  "gender" text,
  "birth_date" date,
  "id_no" text,
  "address_registered" text,
  "address_mailing" text,
  "permanent_date" date,
  "is_device" boolean default false,
  "labor_insurance_status" text,
  "health_insurance_status" text,
  "pension_status" text,
  "insured_unit" text,
  "insured_grade" integer,
  "insured_enroll_date" date,
  "insured_withdraw_date" date,
  "fixed_off_days" text,
  "available_slots" text,
  "weekly_work_days" integer,
  "need_duty" boolean default false,
  "can_substitute" boolean default false,
  "annual_leave_total" numeric,
  "annual_leave_used" numeric default 0,
  "need_punch" boolean default false,
  "pt_rate" numeric default 0,
  "group_rate" numeric default 0,
  "duty_hourly" numeric default 0,
  "count_salary" boolean default true,
  "promote_date" date,
  "custom_salary" boolean default false,
  "weekly_shift" text,
  "insurance_identity" text default 'employee'::text not null,
  "al_carry_hours" numeric default 0 not null,
  "al_earned_hours" numeric default 0 not null,
  "al_settled_year" integer,
  "resign_date" date,
  "weekly_min_shift_days" integer,
  "base_salary" numeric,
  "pt_mode" text,
  "pt_tiers" jsonb,
  "pt_bonus" jsonb,
  "pt_bonus_enabled" boolean default true,
  "pt_bonus_mode" text default 'cumulative'::text,
  "job_title" text,
  "emergency_relation" text,
  "note" text,
  "default_shift" text,
  "al_settlement" text,
  primary key (id),
  constraint employees_auth_id_key unique (auth_id),
  constraint employees_phone_key unique (phone),
  constraint employees_insurance_identity_chk check ((insurance_identity = any (array['employee'::text, 'owner'::text])))
);

create table public.members (
  "id" text not null,
  "auth_id" uuid,
  "name" text,
  "phone" text,
  "email" text,
  "gender" member_gender default 'unspecified'::member_gender,
  "birthday" date,
  "height" numeric,
  "weight" numeric,
  "trial_date" date,
  "last_class_date" date,
  "source" member_source default 'other'::member_source,
  "tier" text,
  "tags" jsonb default '[]'::jsonb,
  "is_pt" boolean default false,
  "default_coach_id" text,
  "note" text,
  "status" member_status default 'active'::member_status,
  "created_at" timestamp with time zone default now(),
  "birth_date" date,
  "emergency_name" text,
  "emergency_phone" text,
  "must_setup" boolean default false,
  "line_id" text,
  "emergency_relation" text,
  "level" text default 'regular'::text not null,
  primary key (id),
  constraint members_auth_id_key unique (auth_id),
  constraint members_phone_key unique (phone)
);

create table public.ticket_types (
  "id" text not null,
  "name" text not null,
  "category" ticket_category not null,
  "variant" text,
  "color" text,
  "time_restricted" boolean default false,
  "requires_coach" boolean default false,
  "member_bookable" boolean default true,
  "active" boolean default true,
  "code" text,
  "category_id" text,
  "validity_mode" text default 'purchase'::text,
  "validity_days" integer,
  "sellable" boolean default true,
  "is_legacy" boolean default false,
  "sort_order" integer,
  "benefit_type" text,
  primary key (id),
  constraint chk_validity_mode check ((validity_mode = any (array['purchase'::text, 'first_use'::text, 'fixed_date'::text])))
);

create table public.course_plans (
  "id" text not null,
  "name" text not null,
  "ticket_type_id" text,
  "format" text,
  "unit_price" integer default 0,
  "sessions_base" integer default 0,
  "sessions_bonus" integer default 0,
  "valid_days" integer default 365,
  "active" boolean default true,
  "plan_type" text,
  "installment" boolean default false,
  "member_applyable" boolean default false,
  primary key (id)
);

create table public.member_tickets (
  "id" text not null,
  "member_id" text,
  "ticket_type_id" text,
  "source_plan_id" text,
  "plan_name" text,
  "format" text,
  "source" text default 'purchase'::text,
  "purchase_date" date,
  "start_date" date,
  "expire_date" date,
  "sessions_total" integer default 0,
  "sessions_remaining" integer default 0,
  "status" ticket_status default 'usable'::ticket_status,
  "payment_status" pay_status default 'paid'::pay_status,
  "invoice_status" invoice_status default 'none'::invoice_status,
  "created_at" timestamp with time zone default now(),
  "unit_price" numeric default 0,
  "amount_paid" numeric default 0,
  "makeup_for_booking" text,
  "unlocked_sessions" integer,
  "installment" jsonb,
  "source_booking_id" text,
  "invoice_number" text,
  "activated_at" timestamp with time zone,
  "source_type" text,
  "source_ref" text,
  primary key (id)
);

create table public.ticket_logs (
  "id" text not null,
  "ticket_id" text,
  "action" ticket_log_action not null,
  "delta" integer default 0,
  "booking_id" text,
  "operator" text,
  "note" text,
  "created_at" timestamp with time zone default now(),
  primary key (id)
);

create table public.spaces (
  "id" text not null,
  "label" text not null,
  "exclusive" boolean default false not null,
  "concurrent_capacity" integer default 1 not null,
  "sort_order" integer default 0,
  "created_at" timestamp with time zone default now(),
  primary key (id)
);

create table public.space_resources (
  "id" text not null,
  "space_id" text not null,
  "label" text not null,
  "status" text default 'active'::text not null,
  "sort_order" integer default 0,
  "created_at" timestamp with time zone default now(),
  primary key (id),
  constraint space_resources_status_check check ((status = any (array['active'::text, 'maintenance'::text, 'retired'::text])))
);

create table public.bookings (
  "id" text not null,
  "member_id" text,
  "coach_id" text,
  "ticket_id" text,
  "ticket_type_id" text,
  "category" ticket_category,
  "format" text,
  "date" date not null,
  "start_time" text not null,
  "duration" integer default 60,
  "status" booking_status default 'booked'::booking_status,
  "is_substitute" boolean default false,
  "original_coach_id" text,
  "note" text,
  "created_by" text,
  "created_at" timestamp with time zone default now(),
  "checked_in_at" timestamp with time zone,
  "reward_issued" boolean default false,
  "reward_issued_at" timestamp with time zone,
  "reward_type" text,
  "makeup" boolean default false,
  "makeup_date" date,
  "makeup_time" text,
  "recurring" boolean default false,
  "substitute_coach_id" text,
  "member_ids" jsonb default '[]'::jsonb,
  "trial_name" text,
  "trial_phone" text,
  "attendance" jsonb default '{}'::jsonb,
  "venue_unit" text,
  "cancelled_at" timestamp with time zone,
  "refund_waived" boolean default false,
  "makeup_granted" boolean default false,
  "space_id" text,
  "resource_id" text,
  "reward_status" reward_status_enum default 'pending'::reward_status_enum,
  "checkin_source" text,
  "actor_user_id" text,
  "operator_employee_id" text,
  "benefit_type" text,
  "makeup_status" text default 'not_requested'::text,
  primary key (id)
);

create table public.notifications (
  "id" text not null,
  "recipient_type" notify_recipient not null,
  "recipient_id" text not null,
  "type" text,
  "title" text,
  "body" text,
  "read" boolean default false,
  "created_at" timestamp with time zone default now(),
  primary key (id)
);

create table public.purchases (
  "id" text not null,
  "member_id" text,
  "plan_id" text,
  "ticket_id" text,
  "plan_name" text,
  "list_price" numeric,
  "deal_amount" numeric,
  "payment_method" text,
  "installment_count" integer,
  "note" text,
  "operator" text,
  "source" text default 'backoffice'::text,
  "created_at" timestamp with time zone default now(),
  "ticket_type_id" text,
  "original_price" numeric,
  "discount_amount" numeric,
  "payment_status" text default 'paid'::text,
  primary key (id),
  constraint chk_pay_status check ((payment_status = any (array['pending'::text, 'paid'::text, 'refunded'::text, 'partial'::text])))
);

create table public.purchase_applications (
  "id" text not null,
  "member_id" text,
  "plan_id" text,
  "plan_name" text,
  "list_price" numeric,
  "signature" text,
  "contract_version" text,
  "status" text default 'pending'::text,
  "reject_reason" text,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  "ip" text,
  "agreed_health" boolean default false,
  "signed_at" timestamp with time zone,
  "contract_snapshot" text,
  "install_periods" integer default 1 not null,
  "invoice_type" text,
  "invoice_status" text,
  "invoice_number" text,
  "payment_method" text,
  "installment_count" integer default 1,
  primary key (id)
);

create table public.attendance (
  "id" text not null,
  "emp_id" text not null,
  "emp_name" text,
  "date" date not null,
  "clock_in" text,
  "clock_out" text,
  "work_hours" numeric,
  "created_at" timestamp with time zone default now(),
  primary key (id)
);

create table public.exercises (
  "id" text not null,
  "name" text not null,
  "body_part" text,
  "is_custom" boolean default false,
  "created_by" text,
  "active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "default_tool" text,
  "default_posture" text,
  "image_url" text,
  "video_url" text,
  "description" text,
  primary key (id)
);

create table public.training_logs (
  "id" text not null,
  "booking_id" text,
  "member_id" text,
  "coach_id" text,
  "exercise_name" text not null,
  "body_part" text,
  "posture" text,
  "tool" text,
  "reps" integer,
  "sets" integer,
  "note" text,
  "created_at" timestamp with time zone default now(),
  "sets_detail" text,
  primary key (id)
);

create table public.punch_requests (
  "id" text not null,
  "emp_id" text not null,
  "emp_name" text,
  "date" date not null,
  "clock_in" text,
  "clock_out" text,
  "reason" text,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now(),
  "reviewed_at" timestamp with time zone,
  primary key (id)
);

create table public.venues (
  "id" text not null,
  "name" text not null,
  "capacity" integer default 1 not null,
  "categories" jsonb default '[]'::jsonb not null,
  "active" boolean default true not null,
  "sort_order" integer default 0,
  "created_at" timestamp with time zone default now(),
  primary key (id)
);

create table public.salary_templates (
  "id" text not null,
  "pt_rate" numeric default 0,
  "group_rate" numeric default 0,
  "duty_hourly" numeric default 0,
  "updated_at" timestamp with time zone default now(),
  "config" jsonb,
  primary key (id)
);

create table public.shifts (
  "id" text not null,
  "emp_id" text not null,
  "date" date not null,
  "start_time" text not null,
  "end_time" text not null,
  "hours" numeric(4,1) default 0 not null,
  "note" text,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "leave_type" text,
  "leave_hours" numeric default 0,
  primary key (id)
);

create table public.leave_settlements (
  "id" text not null,
  "emp_id" text not null,
  "year" integer not null,
  "carry_hours" numeric default 0 not null,
  "earned_hours" numeric default 0 not null,
  "used_hours" numeric default 0 not null,
  "cashout_hours" numeric default 0 not null,
  "carryover_hours" numeric default 0 not null,
  "settled_date" date default CURRENT_DATE not null,
  "operator" text,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  primary key (id),
  constraint leave_settlements_emp_id_year_key unique (emp_id, year)
);

create table public.ticket_type_member_levels (
  "ticket_type_id" text not null,
  "member_level" text not null,
  primary key (ticket_type_id, member_level)
);

create table public.reward_rules (
  "id" text not null,
  "event_type" text not null,
  "source_benefit_type" text not null,
  "reward_benefit_type" text not null,
  "reward_ticket_type_id" text not null,
  "reward_amount" integer not null,
  "valid_days" integer not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now(),
  primary key (id)
);

-- ========== 外鍵（全表建立後補） ==========
alter table public.bookings add constraint bookings_coach_id_fkey foreign key (coach_id) references employees(id) on delete set null;
alter table public.bookings add constraint bookings_member_id_fkey foreign key (member_id) references members(id) on delete cascade;
alter table public.bookings add constraint bookings_original_coach_id_fkey foreign key (original_coach_id) references employees(id) on delete set null;
alter table public.bookings add constraint bookings_resource_fk foreign key (resource_id) references space_resources(id) on delete restrict;
alter table public.bookings add constraint bookings_space_fk foreign key (space_id) references spaces(id) on delete restrict;
alter table public.bookings add constraint bookings_ticket_id_fkey foreign key (ticket_id) references member_tickets(id) on delete set null;
alter table public.bookings add constraint bookings_ticket_type_id_fkey foreign key (ticket_type_id) references ticket_types(id);
alter table public.course_plans add constraint course_plans_ticket_type_id_fkey foreign key (ticket_type_id) references ticket_types(id);
alter table public.employees add constraint employees_auth_id_fkey foreign key (auth_id) references auth.users(id) on delete set null;
alter table public.leave_settlements add constraint leave_settlements_emp_id_fkey foreign key (emp_id) references employees(id) on delete cascade;
alter table public.member_tickets add constraint member_tickets_member_id_fkey foreign key (member_id) references members(id) on delete cascade;
alter table public.member_tickets add constraint member_tickets_source_plan_id_fkey foreign key (source_plan_id) references course_plans(id);
alter table public.member_tickets add constraint member_tickets_ticket_type_id_fkey foreign key (ticket_type_id) references ticket_types(id);
alter table public.members add constraint members_auth_id_fkey foreign key (auth_id) references auth.users(id) on delete set null;
alter table public.members add constraint members_default_coach_id_fkey foreign key (default_coach_id) references employees(id) on delete set null;
alter table public.members add constraint members_level_fkey foreign key (level) references member_level(level);
alter table public.purchases add constraint purchases_ticket_type_id_fkey foreign key (ticket_type_id) references ticket_types(id);
alter table public.space_resources add constraint space_resources_space_id_fkey foreign key (space_id) references spaces(id);
alter table public.ticket_logs add constraint ticket_logs_ticket_id_fkey foreign key (ticket_id) references member_tickets(id) on delete cascade;
alter table public.ticket_type_member_levels add constraint ttml_member_level_fkey foreign key (member_level) references member_level(level);
alter table public.ticket_type_member_levels add constraint ttml_ticket_type_id_fkey foreign key (ticket_type_id) references ticket_types(id) on delete cascade;
alter table public.ticket_types add constraint ticket_types_category_id_fkey foreign key (category_id) references category(id);

-- ========== 索引（非約束附帶者；含正式庫既有重複，為求 1:1 對齊） ==========
create index attendance_date_idx on public.attendance using btree (date);
create unique index attendance_emp_date_uniq on public.attendance using btree (emp_id, date);
create index idx_bookings_coach on public.bookings using btree (coach_id);
create index idx_bookings_date on public.bookings using btree (date);
create index idx_bookings_member on public.bookings using btree (member_id);
create index ix_bookings_coach on public.bookings using btree (coach_id);
create index ix_bookings_date on public.bookings using btree (date);
create unique index leave_settlements_emp_year_idx on public.leave_settlements using btree (emp_id, year);
create index idx_mt_source_booking on public.member_tickets using btree (source_booking_id) where (source_booking_id is not null);
create index idx_tickets_member on public.member_tickets using btree (member_id);
create index ix_member_tickets_member on public.member_tickets using btree (member_id);
create index ix_member_tickets_status on public.member_tickets using btree (status);
create index ix_member_tickets_type on public.member_tickets using btree (ticket_type_id);
create unique index members_phone_unique on public.members using btree (phone);
create index idx_notif_recipient on public.notifications using btree (recipient_type, recipient_id);
create index idx_punch_requests_emp on public.punch_requests using btree (emp_id);
create index idx_punch_requests_status on public.punch_requests using btree (status);
create index ix_purchases_member on public.purchases using btree (member_id);
create index idx_shifts_date on public.shifts using btree (date);
create index idx_shifts_emp_date on public.shifts using btree (emp_id, date);
create index idx_logs_ticket on public.ticket_logs using btree (ticket_id);
create index ix_ticket_types_category on public.ticket_types using btree (category_id);
create unique index ux_ticket_types_code on public.ticket_types using btree (code) where (code is not null);
create index idx_tlog_booking on public.training_logs using btree (booking_id);
create index idx_tlog_created on public.training_logs using btree (created_at);
create index idx_tlog_member on public.training_logs using btree (member_id);
