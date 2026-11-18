-- ============================================================================
-- AN PHUC EDUCATION - LMS / DATABASE SCHEMA - STAGE 1
-- PostgreSQL on Supabase | New database, independent of legacy Google Sheets.
-- Run in Supabase SQL Editor on a NEW project after reviewing the notes.
-- CRITICAL: browser may contain only the publishable/anon key, NEVER secret key.
-- Login: Supabase Auth phone OTP for parents, Supabase Auth email for staff.
-- Staff roles are granted manually using a real auth.users.id (see below).
-- ============================================================================

create extension if not exists pgcrypto;
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

-- Keep helpers outside the exposed public schema.
create or replace function app_private.normalize_vn_phone(raw_phone text)
returns text language plpgsql immutable set search_path = '' as $$
declare digits text;
begin
  digits := pg_catalog.regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g');
  if digits ~ '^84[0-9]{9}$' then
    return '0' || pg_catalog.substr(digits, 3);
  elsif digits ~ '^0[0-9]{9}$' then
    return digits;
  elsif digits ~ '^[0-9]{9}$' then
    return '0' || digits;
  end if;
  return null;
end;
$$;

create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function app_private.is_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and exists (
       select 1 from public.staff_roles sr
       where sr.user_id = (select auth.uid()) and sr.role in ('teacher','admin')
     );
$$;

-- Phone number is never authorization by itself: this value comes from a
-- verified Supabase Auth phone-OTP session. Anonymous Auth users are denied.
create or replace function app_private.current_parent_phone()
returns text language sql stable set search_path = '' as $$
  select case
    when (select auth.uid()) is not null
     and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false
    then app_private.normalize_vn_phone((select auth.jwt())->>'phone')
    else null
  end;
$$;

-- 1. STUDENTS: Student_List -> students, unique immutable student_code.
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  full_name text not null check (length(trim(full_name)) >= 2),
  grade smallint not null check (grade between 6 and 12),
  class_name text not null check (length(trim(class_name)) > 0),
  parent_phone text check (parent_phone is null or parent_phone ~ '^0[0-9]{9}$'),
  email text,
  custom_fee numeric(12,0) check (custom_fee is null or custom_fee >= 0),
  enrolled_on date,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_students_parent_phone on public.students(parent_phone);
create index if not exists idx_students_grade_class on public.students(grade, class_name, full_name);
create index if not exists idx_students_active_grade on public.students(grade) where active;

-- 2. QUESTIONS: answer key & explanation are secret and must not be queried
-- directly by students. Client uses get_lesson_questions() to obtain prompts.
create table if not exists public.questions (
  question_id text primary key,
  grade smallint not null check (grade between 6 and 12),
  subject text not null default 'Toán',
  chapter text not null,
  topic text not null,
  lesson_key text not null,
  question_type text not null check (question_type in ('MC','TF','SA')),
  level text not null check (level in ('Nhận biết','Thông hiểu','Vận dụng','Vận dụng cao')),
  question_text text not null,
  option_1 text,
  option_2 text,
  option_3 text,
  option_4 text,
  correct_answer text not null,
  explanation text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_questions_mc_options check (
    question_type <> 'MC' or
    (nullif(trim(option_1),'') is not null and nullif(trim(option_2),'') is not null
     and nullif(trim(option_3),'') is not null and nullif(trim(option_4),'') is not null)
  ),
  constraint ck_questions_tf_options check (
    question_type <> 'TF' or
    (nullif(trim(option_1),'') is not null and nullif(trim(option_2),'') is not null
     and nullif(trim(option_3),'') is not null and nullif(trim(option_4),'') is not null)
  )
);
create index if not exists idx_questions_grade_lesson on public.questions(grade, lesson_key, is_active);
create index if not exists idx_questions_grade_chapter_topic on public.questions(grade, chapter, topic);
create index if not exists idx_questions_type_level on public.questions(question_type, level);

-- Per-lesson publishing toggle, to be driven by teacher portal in Stage 4.
create table if not exists public.lesson_visibility (
  grade smallint not null check (grade between 6 and 12),
  lesson_key text not null,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (grade, lesson_key)
);

-- 3. LESSON_PROGRESS: best score per level, first/best overall, attempts.
-- The client cannot write scores. Server-side grading is added in Stage 3.
create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_key text not null,
  grade smallint not null check (grade between 6 and 12),
  has_c1 boolean not null default false,
  has_c2 boolean not null default false,
  has_c3 boolean not null default false,
  first_overall numeric(5,2) check (first_overall between 0 and 10),
  best_c1 numeric(5,2) not null default 0 check (best_c1 between 0 and 10),
  best_c2 numeric(5,2) not null default 0 check (best_c2 between 0 and 10),
  best_c3 numeric(5,2) not null default 0 check (best_c3 between 0 and 10),
  best_overall numeric(5,2) not null default 0 check (best_overall between 0 and 10),
  attempts_count integer not null default 0 check (attempts_count >= 0),
  is_completed boolean not null default false,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, lesson_key)
);
create index if not exists idx_progress_student_grade on public.lesson_progress(student_id, grade);
create index if not exists idx_progress_grade_best on public.lesson_progress(grade, best_overall desc);
create index if not exists idx_progress_lesson on public.lesson_progress(lesson_key, best_overall desc);

-- 4. ATTENDANCE_TUITION: one table, two strictly disjoint record types.
-- The center collects tuition once per month: paid or unpaid, no partial.
-- Missing tuition row is treated as UNPAID by business logic in Stage 4.
create table if not exists public.attendance_tuition (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  record_type text not null check (record_type in ('attendance','tuition')),
  class_date date,
  attendance_status text check (attendance_status in ('present','absent','excused')),
  tuition_month smallint check (tuition_month between 1 and 12),
  tuition_year smallint check (tuition_year between 2020 and 2100),
  fee_due numeric(12,0) not null default 0 check (fee_due >= 0),
  paid_amount numeric(12,0) not null default 0 check (paid_amount >= 0),
  fee_status text check (fee_status in ('paid','unpaid')),
  payment_method text,
  payment_reference text,
  paid_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_attendance_tuition_shape check (
    (record_type = 'attendance'
      and class_date is not null and attendance_status is not null
      and tuition_month is null and tuition_year is null and fee_status is null
      and fee_due = 0 and paid_amount = 0 and paid_at is null)
    or
    (record_type = 'tuition'
      and class_date is null and attendance_status is null
      and tuition_month is not null and tuition_year is not null and fee_status is not null
      and ( (fee_status = 'unpaid' and paid_amount = 0 and paid_at is null)
         or (fee_status = 'paid' and paid_amount = fee_due) ))
  )
);
create unique index if not exists uq_attendance_student_day
  on public.attendance_tuition(student_id, class_date)
  where record_type = 'attendance';
create unique index if not exists uq_tuition_student_month
  on public.attendance_tuition(student_id, tuition_year, tuition_month)
  where record_type = 'tuition';
create index if not exists idx_tuition_month_status
  on public.attendance_tuition(tuition_year, tuition_month, fee_status)
  where record_type = 'tuition';
create index if not exists idx_attendance_day
  on public.attendance_tuition(class_date, attendance_status)
  where record_type = 'attendance';

-- 5. APP_SETTINGS: public values are explicitly marked is_public.
-- NEVER store Supabase secret/service-role keys, bank tokens or passwords here.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

-- Updated timestamps shared by editable tables.
create or replace function app_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_students_updated on public.students;
create trigger trg_students_updated before update on public.students
for each row execute function app_private.touch_updated_at();
drop trigger if exists trg_questions_updated on public.questions;
create trigger trg_questions_updated before update on public.questions
for each row execute function app_private.touch_updated_at();
drop trigger if exists trg_visibility_updated on public.lesson_visibility;
create trigger trg_visibility_updated before update on public.lesson_visibility
for each row execute function app_private.touch_updated_at();
drop trigger if exists trg_progress_updated on public.lesson_progress;
create trigger trg_progress_updated before update on public.lesson_progress
for each row execute function app_private.touch_updated_at();
drop trigger if exists trg_attendance_tuition_updated on public.attendance_tuition;
create trigger trg_attendance_tuition_updated before update on public.attendance_tuition
for each row execute function app_private.touch_updated_at();
drop trigger if exists trg_app_settings_updated on public.app_settings;
create trigger trg_app_settings_updated before update on public.app_settings
for each row execute function app_private.touch_updated_at();

create or replace function app_private.can_view_student(student_uuid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.is_teacher() or exists (
    select 1 from public.students s
    where s.id = student_uuid
      and s.active = true
      and s.parent_phone is not null
      and s.parent_phone = app_private.current_parent_phone()
  );
$$;

-- Harden helper function privileges. These helpers are NOT in exposed schemas.
revoke all on function app_private.is_teacher() from public, anon;
revoke all on function app_private.normalize_vn_phone(text) from public, anon;
revoke all on function app_private.current_parent_phone() from public, anon;
revoke all on function app_private.can_view_student(uuid) from public, anon;
grant execute on function app_private.is_teacher() to authenticated;
grant execute on function app_private.normalize_vn_phone(text) to authenticated;
grant execute on function app_private.current_parent_phone() to authenticated;
grant execute on function app_private.can_view_student(uuid) to authenticated;

-- Explicit table privileges; RLS policy alone does not confer SQL privilege.
revoke all on public.staff_roles, public.students, public.questions,
  public.lesson_visibility, public.lesson_progress, public.attendance_tuition,
  public.app_settings from anon, authenticated;
grant select on public.staff_roles to authenticated;
grant select, insert, update, delete on public.students, public.questions,
  public.lesson_visibility, public.lesson_progress, public.attendance_tuition
  to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select on public.app_settings to anon;

alter table public.staff_roles enable row level security;
alter table public.students enable row level security;
alter table public.questions enable row level security;
alter table public.lesson_visibility enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.attendance_tuition enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists staff_read_self on public.staff_roles;
create policy staff_read_self on public.staff_roles
  for select to authenticated using (user_id = (select auth.uid()));

-- PARENTS: view only their own students via verified OTP phone claim.
drop policy if exists students_read_allowed on public.students;
create policy students_read_allowed on public.students
  for select to authenticated using (app_private.can_view_student(id));
drop policy if exists students_write_teacher on public.students;
create policy students_write_teacher on public.students
  for all to authenticated using (app_private.is_teacher())
  with check (app_private.is_teacher());

-- Questions hold answer keys, so only teachers have direct table access.
drop policy if exists questions_teacher_only on public.questions;
create policy questions_teacher_only on public.questions
  for all to authenticated using (app_private.is_teacher())
  with check (app_private.is_teacher());

drop policy if exists visibility_teacher_only on public.lesson_visibility;
create policy visibility_teacher_only on public.lesson_visibility
  for all to authenticated using (app_private.is_teacher())
  with check (app_private.is_teacher());

drop policy if exists progress_read_allowed on public.lesson_progress;
create policy progress_read_allowed on public.lesson_progress
  for select to authenticated using (app_private.can_view_student(student_id));
drop policy if exists progress_teacher_write on public.lesson_progress;
create policy progress_teacher_write on public.lesson_progress
  for all to authenticated using (app_private.is_teacher())
  with check (app_private.is_teacher());

drop policy if exists records_read_allowed on public.attendance_tuition;
create policy records_read_allowed on public.attendance_tuition
  for select to authenticated using (app_private.can_view_student(student_id));
drop policy if exists records_teacher_write on public.attendance_tuition;
create policy records_teacher_write on public.attendance_tuition
  for all to authenticated using (app_private.is_teacher())
  with check (app_private.is_teacher());

drop policy if exists settings_read_public_or_teacher on public.app_settings;
drop policy if exists settings_read_public on public.app_settings;
drop policy if exists settings_read_staff on public.app_settings;
create policy settings_read_public on public.app_settings
  for select to anon, authenticated using (is_public);
create policy settings_read_staff on public.app_settings
  for select to authenticated using (app_private.is_teacher());
drop policy if exists settings_teacher_write on public.app_settings;
create policy settings_teacher_write on public.app_settings
  for all to authenticated using (app_private.is_teacher())
  with check (app_private.is_teacher());

-- Student-safe read API. It never exposes correct_answer or explanation.
-- The frontend should call supabase.rpc('get_lesson_questions', {...}).
-- Security-definer is narrowly scoped: checks user + grade + publication.
create or replace function public.get_lesson_questions(p_grade smallint, p_lesson_key text)
returns table (
  question_id text, grade smallint, chapter text, topic text, lesson_key text,
  question_type text, level text, question_text text,
  option_1 text, option_2 text, option_3 text, option_4 text, image_url text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'LOGIN_REQUIRED' using errcode = '42501';
  end if;
  if not app_private.is_teacher() and not exists (
    select 1 from public.students s
    where s.grade = p_grade and s.active = true
      and s.parent_phone = app_private.current_parent_phone()
  ) then
    raise exception 'GRADE_ACCESS_DENIED' using errcode = '42501';
  end if;
  return query
    select q.question_id, q.grade, q.chapter, q.topic, q.lesson_key,
           q.question_type, q.level, q.question_text,
           q.option_1, q.option_2, q.option_3, q.option_4, q.image_url
    from public.questions q
    where q.grade = p_grade and q.lesson_key = p_lesson_key and q.is_active
      and (app_private.is_teacher() or not exists (
        select 1 from public.lesson_visibility lv
        where lv.grade = q.grade and lv.lesson_key = q.lesson_key
          and lv.is_published = false
      ))
    order by q.question_id;
end;
$$;
revoke all on function public.get_lesson_questions(smallint,text) from public, anon;
grant execute on function public.get_lesson_questions(smallint,text) to authenticated;

-- Safe lesson catalog, including three levels, without any answer keys.
create or replace function public.get_lesson_catalog(p_grade smallint)
returns table (
  grade smallint, chapter text, topic text, lesson_key text,
  c1_count bigint, c2_count bigint, c3_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'LOGIN_REQUIRED' using errcode = '42501';
  end if;
  if not app_private.is_teacher() and not exists (
    select 1 from public.students s
    where s.grade = p_grade and s.active
      and s.parent_phone = app_private.current_parent_phone()
  ) then
    raise exception 'GRADE_ACCESS_DENIED' using errcode = '42501';
  end if;
  return query
    select q.grade, q.chapter, q.topic, q.lesson_key,
           count(*) filter (where q.question_type = 'MC'
               and q.level in ('Nhận biết','Thông hiểu')) as c1_count,
           count(*) filter (where q.question_type = 'TF'
               or (q.question_type = 'MC' and q.level = 'Vận dụng')) as c2_count,
           count(*) filter (where q.question_type = 'SA'
               or (q.question_type = 'MC' and q.level = 'Vận dụng cao')) as c3_count
    from public.questions q
    where q.grade = p_grade and q.is_active
      and (app_private.is_teacher() or not exists (
        select 1 from public.lesson_visibility lv
        where lv.grade = q.grade and lv.lesson_key = q.lesson_key
          and lv.is_published = false
      ))
    group by q.grade, q.chapter, q.topic, q.lesson_key
    order by q.chapter, q.topic;
end;
$$;
revoke all on function public.get_lesson_catalog(smallint) from public, anon;
grant execute on function public.get_lesson_catalog(smallint) to authenticated;

-- Public safe settings; any additional setting remains private by default.
insert into public.app_settings (key, value, is_public, description) values
  ('center_name', '"Trung tâm Toán An Phúc"'::jsonb, true, 'Tên hiển thị'),
  ('center_slogan', '"Vững kiến thức. Chắc tương lai."'::jsonb, true, 'Khẩu hiệu'),
  ('representative', '"Lê Quốc Hải"'::jsonb, true, 'Đại diện trung tâm'),
  ('tuition_print_paper', '"a4-2up"'::jsonb, false, 'Mặc định 2 A5 trên A4 ngang'),
  ('tuition_notice_mode', '"full"'::jsonb, false, 'Mặc định đầy đủ')
on conflict (key) do nothing;

-- BOOTSTRAP STAFF (manual, once Auth user already exists; NEVER put a default
-- admin password in JS/SQL):
-- insert into public.staff_roles(user_id, role)
-- values ('REPLACE_WITH_REAL_AUTH_USER_UUID', 'admin');
-- Do not allow users to INSERT into staff_roles via browser.
-- PRODUCTION NOTES:
-- * Grade algorithms and answer verification must run server-side in Stage 3.
-- * get_lesson_questions hides answers; do not return raw questions to students.
-- * Never use parent phone input alone as authorization: send and verify OTP.
-- * Import from old Google Sheets is a future migration, not performed here.
