-- ============================================================================
-- AN PHUC LMS - STAGE 3 SERVER-SIDE SCORING MIGRATION
-- Run AFTER supabase_schema.sql in a NEW/TEST Supabase project.
-- Never expose question.correct_answer or write final scores from browser.
-- It is safe to re-run the CREATE OR REPLACE FUNCTION; do not delete data.
-- ============================================================================

-- Teacher-managed schedules. Parents may read *only* schedules of children
-- matched to their verified Supabase Auth phone. Stage 4 adds schedule editor.
create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  grade smallint not null check (grade between 6 and 12),
  class_name text not null,
  weekday smallint not null check (weekday between 2 and 8),
  start_time time not null,
  duration_minutes integer not null default 90 check (duration_minutes between 15 and 240),
  teacher_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(grade,class_name,weekday,start_time)
);
create index if not exists idx_class_schedules_class on public.class_schedules(grade,class_name,is_active);
alter table public.class_schedules enable row level security;
revoke all on public.class_schedules from anon,authenticated;
grant select,insert,update,delete on public.class_schedules to authenticated;
drop policy if exists class_schedules_read on public.class_schedules;
create policy class_schedules_read on public.class_schedules for select to authenticated
  using (app_private.is_teacher() or exists (
    select 1 from public.students s where s.grade=class_schedules.grade
      and s.class_name=class_schedules.class_name and s.active
      and s.parent_phone=app_private.current_parent_phone()
  ));
drop policy if exists class_schedules_write on public.class_schedules;
create policy class_schedules_write on public.class_schedules for all to authenticated
  using (app_private.is_teacher()) with check (app_private.is_teacher());

-- Per-attempt idempotency receipts: not readable or writeable directly by web
-- users. They are used only by the SECURITY DEFINER RPC below.
create table if not exists public.lesson_attempt_receipts (
  student_id uuid not null references public.students(id) on delete cascade,
  request_id uuid not null,
  lesson_key text not null,
  level_number smallint not null check (level_number between 1 and 3),
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (student_id,request_id)
);
create index if not exists idx_attempt_receipts_student_time
  on public.lesson_attempt_receipts(student_id,created_at desc);
alter table public.lesson_attempt_receipts enable row level security;
revoke all on public.lesson_attempt_receipts from public, anon, authenticated;

-- Single atomic verification + scoring + progress update transaction.
-- Client supplies only raw answers (MC original option key A-D, TF DDSS, SA
-- text) and UUID request ID. Server independently fetches all active questions,
-- checks publication/OTP/student ownership/level locks, and computes score.
create or replace function public.submit_lesson_attempt(
  p_student_id uuid,
  p_grade smallint,
  p_lesson_key text,
  p_level smallint,
  p_answers jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_student public.students%rowtype;
  v_progress public.lesson_progress%rowtype;
  v_receipt public.lesson_attempt_receipts%rowtype;
  v_q record;
  v_count1 integer := 0;
  v_count2 integer := 0;
  v_count3 integer := 0;
  v_count integer := 0;
  v_answers_count integer := 0;
  v_answer text;
  v_correct text;
  v_fraction numeric;
  v_raw_score numeric := 0;
  v_points numeric;
  v_awarded numeric;
  v_score numeric;
  v_c1 numeric;
  v_c2 numeric;
  v_c3 numeric;
  v_k integer;
  v_i integer;
  v_best numeric;
  v_done boolean;
  v_breakdown jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'LOGIN_REQUIRED' using errcode='42501';
  end if;
  if p_student_id is null or p_grade is null or p_lesson_key is null
     or length(btrim(p_lesson_key))=0 or p_level is null or p_level not in (1,2,3)
     or p_request_id is null then
    raise exception 'INVALID_ATTEMPT_PARAMETERS' using errcode='22023';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'ANSWERS_MUST_BE_OBJECT' using errcode='22023';
  end if;
  select * into v_student from public.students s
    where s.id=p_student_id and s.active;
  if not found or v_student.grade <> p_grade then
    raise exception 'STUDENT_NOT_FOUND' using errcode='42501';
  end if;
  if not app_private.is_teacher() and (
    v_student.parent_phone is null or
    v_student.parent_phone is distinct from app_private.current_parent_phone()
  ) then
    raise exception 'STUDENT_ACCESS_DENIED' using errcode='42501';
  end if;
  if not app_private.is_teacher() and exists (
    select 1 from public.lesson_visibility lv
    where lv.grade=p_grade and lv.lesson_key=p_lesson_key and not lv.is_published
  ) then
    raise exception 'LESSON_NOT_PUBLISHED' using errcode='42501';
  end if;

  -- Guard duplicate requests *before* marking progress. Concurrent duplicate
  -- requests synchronize through unique (student_id, request_id).
  insert into public.lesson_attempt_receipts(student_id,request_id,lesson_key,level_number)
    values(p_student_id,p_request_id,p_lesson_key,p_level)
    on conflict (student_id,request_id) do nothing;
  select * into v_receipt from public.lesson_attempt_receipts a
    where a.student_id=p_student_id and a.request_id=p_request_id for update;
  if v_receipt.lesson_key <> p_lesson_key or v_receipt.level_number <> p_level then
    raise exception 'REQUEST_ID_ALREADY_USED' using errcode='22023';
  end if;
  if v_receipt.response is not null then return v_receipt.response; end if;

  select count(*) filter(where q.question_type='MC' and q.level in ('Nhận biết','Thông hiểu')),
         count(*) filter(where q.question_type='TF' or (q.question_type='MC' and q.level='Vận dụng')),
         count(*) filter(where q.question_type='SA' or (q.question_type='MC' and q.level='Vận dụng cao'))
    into v_count1,v_count2,v_count3
    from public.questions q
    where q.grade=p_grade and q.lesson_key=p_lesson_key and q.is_active;
  v_k := (case when v_count1>0 then 1 else 0 end)
       + (case when v_count2>0 then 1 else 0 end)
       + (case when v_count3>0 then 1 else 0 end);
  v_count := case p_level when 1 then v_count1 when 2 then v_count2 else v_count3 end;
  if v_count=0 then raise exception 'LEVEL_HAS_NO_QUESTIONS' using errcode='22023'; end if;

  -- Ensure a row exists, then lock it. All parallel submissions for a given
  -- student and lesson are serialized, so no lost updates or bypass of locks.
  insert into public.lesson_progress(student_id,lesson_key,grade,has_c1,has_c2,has_c3)
    values(p_student_id,p_lesson_key,p_grade,v_count1>0,v_count2>0,v_count3>0)
    on conflict (student_id,lesson_key) do nothing;
  select * into v_progress from public.lesson_progress lp
    where lp.student_id=p_student_id and lp.lesson_key=p_lesson_key for update;
  if v_progress.grade<>p_grade then
    raise exception 'PROGRESS_GRADE_MISMATCH' using errcode='22023';
  end if;
  if (p_level=2 and v_count1>0 and v_progress.best_c1<5)
    or (p_level=3 and v_count2>0 and v_progress.best_c2<5)
    or (p_level=3 and v_count2=0 and v_count1>0 and v_progress.best_c1<5) then
    raise exception 'LEVEL_LOCKED' using errcode='42501';
  end if;

  select count(*) into v_answers_count from jsonb_object_keys(p_answers);
  if v_answers_count<>v_count then
    raise exception 'ALL_LEVEL_QUESTIONS_REQUIRED' using errcode='22023';
  end if;
  v_points := 10::numeric/v_count;
  for v_q in
    select q.question_id,q.question_type,q.question_text,q.correct_answer,q.explanation,
           q.option_1,q.option_2,q.option_3,q.option_4
    from public.questions q
    where q.grade=p_grade and q.lesson_key=p_lesson_key and q.is_active
      and (case when q.question_type='TF' or (q.question_type='MC' and q.level='Vận dụng') then 2
                when q.question_type='SA' or (q.question_type='MC' and q.level='Vận dụng cao') then 3
                when q.question_type='MC' and q.level in ('Nhận biết','Thông hiểu') then 1
                else 0 end)=p_level
    order by q.question_id
  loop
    if not p_answers ? v_q.question_id or jsonb_typeof(p_answers->v_q.question_id)<>'string' then
      raise exception 'MISSING_OR_INVALID_ANSWER' using errcode='22023';
    end if;
    v_answer:=btrim(p_answers->>v_q.question_id);
    if length(v_answer)=0 or length(v_answer)>1024 then
      raise exception 'MISSING_OR_TOO_LONG_ANSWER' using errcode='22023';
    end if;
    v_correct:=btrim(v_q.correct_answer);
    v_fraction:=0;
    if v_q.question_type='MC' then
      v_answer:=upper(v_answer);
      if v_answer !~ '^[ABCD]$' then
        raise exception 'INVALID_MC_ANSWER' using errcode='22023';
      end if;
      if v_answer=upper(v_correct) then v_fraction:=1; end if;
    elsif v_q.question_type='TF' then
      v_answer:=replace(upper(v_answer),'Đ','D');
      if v_answer !~ '^[DS]{4}$' then
        raise exception 'INVALID_TF_ANSWER' using errcode='22023';
      end if;
      v_correct:=replace(upper(v_correct),'Đ','D');
      for v_i in 1..4 loop
        if substr(v_answer,v_i,1)=substr(v_correct,v_i,1) then
          v_fraction:=v_fraction+0.25;
        end if;
      end loop;
    elsif v_q.question_type='SA' then
      v_answer:=replace(v_answer,',','.');
      v_correct:=replace(v_correct,',','.');
      if length(v_answer)<=80 and length(v_correct)<=80
        and v_answer ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
        and v_correct ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
      then
        begin
          if abs(v_answer::numeric-v_correct::numeric)<0.000001 then v_fraction:=1; end if;
        exception when numeric_value_out_of_range or invalid_text_representation then
          v_fraction:=0;
        end;
      elsif lower(v_answer)=lower(v_correct) then
        v_fraction:=1;
      end if;
    else
      raise exception 'INVALID_QUESTION_TYPE' using errcode='22023';
    end if;
    v_awarded:=v_fraction*v_points;
    v_raw_score:=v_raw_score+v_awarded;
    v_breakdown:=v_breakdown||jsonb_build_array(jsonb_build_object(
      'question_id',v_q.question_id,'question_text',v_q.question_text,
      'question_type',v_q.question_type,'submitted',v_answer,
      'correct_answer',v_correct,'explanation',coalesce(v_q.explanation,''),
      'points',round(v_awarded,2),'is_correct',v_fraction=1
    ));
  end loop;

  v_score:=round(v_raw_score,2);
  v_c1:=greatest(v_progress.best_c1,case when p_level=1 then v_score else 0 end);
  v_c2:=greatest(v_progress.best_c2,case when p_level=2 then v_score else 0 end);
  v_c3:=greatest(v_progress.best_c3,case when p_level=3 then v_score else 0 end);
  v_best:=round(((case when v_count1>0 then v_c1 else 0 end)
     +(case when v_count2>0 then v_c2 else 0 end)
     +(case when v_count3>0 then v_c3 else 0 end))/v_k,2);
  v_done := (v_count1=0 or v_c1>=5) and (v_count2=0 or v_c2>=5)
       and (v_count3=0 or v_c3>=5);
  update public.lesson_progress lp set
    has_c1=v_count1>0,has_c2=v_count2>0,has_c3=v_count3>0,
    best_c1=v_c1,best_c2=v_c2,best_c3=v_c3,best_overall=v_best,
    first_overall=case when lp.attempts_count=0 then v_best else lp.first_overall end,
    attempts_count=lp.attempts_count+1,is_completed=v_done,last_attempt_at=now()
  where lp.student_id=p_student_id and lp.lesson_key=p_lesson_key
  returning * into v_progress;

  v_result:=jsonb_build_object(
    'score',v_score,'breakdown',v_breakdown,'progress',to_jsonb(v_progress),
    'counts',jsonb_build_object('1',v_count1,'2',v_count2,'3',v_count3),
    'unlocked',jsonb_build_object(
      '1',v_count1>0,
      '2',v_count2>0 and (v_count1=0 or v_c1>=5),
      '3',v_count3>0 and (case when v_count2>0 then v_c2>=5
           when v_count1>0 then v_c1>=5 else true end)
    ),'completed',v_done
  );
  update public.lesson_attempt_receipts a set response=v_result
    where a.student_id=p_student_id and a.request_id=p_request_id;
  return v_result;
end;
$$;

revoke all on function public.submit_lesson_attempt(uuid,smallint,text,smallint,jsonb,uuid) from public,anon;
grant execute on function public.submit_lesson_attempt(uuid,smallint,text,smallint,jsonb,uuid) to authenticated;

-- SQL validation queries (after creating a separate test Auth user):
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema='public' AND routine_name='submit_lesson_attempt';
-- IMPORTANT: SQL Editor bypasses user Auth checks; test from a real OTP session.
