-- AN PHUC LMS / STAGE 4 - OPTIONAL PRODUCTION MIGRATION
-- Apply AFTER supabase_schema.sql and supabase_stage3.sql.
-- Does not migrate or modify the legacy Google Sheets website.

begin;
-- Explicitly unknown until the teacher sets the correct default in the portal.
insert into public.app_settings(key,value,is_public,description)
values ('tuition_default_amount','0'::jsonb,true,'Mức học phí tháng mặc định, do giáo viên cấu hình')
on conflict (key) do update set is_public=true;

-- Audit changes to tuition status. Keep audit read-only to the browser.
create table if not exists public.tuition_change_audit (
  id bigint generated always as identity primary key,
  tuition_record_id uuid not null,
  student_id uuid not null,
  tuition_month smallint not null,
  tuition_year smallint not null,
  old_status text,
  new_status text,
  old_fee_due numeric(12,0),
  new_fee_due numeric(12,0),
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_tuition_change_audit_student_month
  on public.tuition_change_audit(student_id,tuition_year,tuition_month,changed_at desc);
revoke all on public.tuition_change_audit from public,anon,authenticated;
grant select on public.tuition_change_audit to authenticated;
alter table public.tuition_change_audit enable row level security;
drop policy if exists tuition_audit_read_teacher on public.tuition_change_audit;
create policy tuition_audit_read_teacher on public.tuition_change_audit
  for select to authenticated using (app_private.is_teacher());

create or replace function app_private.audit_tuition_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.record_type <> 'tuition' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.record_type='tuition'
      and old.fee_status is not distinct from new.fee_status
      and old.fee_due is not distinct from new.fee_due
      and old.paid_amount is not distinct from new.paid_amount then
      return new;
    end if;
  end if;
  insert into public.tuition_change_audit(
    tuition_record_id,student_id,tuition_month,tuition_year,
    old_status,new_status,old_fee_due,new_fee_due,changed_by)
  values (new.id,new.student_id,new.tuition_month,new.tuition_year,
    case when tg_op='UPDATE' then old.fee_status else null end,
    new.fee_status,
    case when tg_op='UPDATE' then old.fee_due else null end,
    new.fee_due,(select auth.uid()));
  return new;
end;
$$;
drop trigger if exists trg_tuition_change_audit on public.attendance_tuition;
create trigger trg_tuition_change_audit
  after insert or update on public.attendance_tuition
  for each row execute function app_private.audit_tuition_change();
commit;
