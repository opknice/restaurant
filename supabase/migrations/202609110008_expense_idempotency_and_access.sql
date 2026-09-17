-- Phase 6A: make expense creation retry-safe and keep attachment state visible.

alter table public.expenses
  add column if not exists client_request_id uuid,
  add column if not exists evidence_status text not null default 'none',
  add column if not exists evidence_last_error text;

do $$
begin
  alter table public.expenses
    add constraint expenses_evidence_status_check
    check (evidence_status in ('none', 'pending', 'uploaded', 'failed'));
exception
  when duplicate_object then null;
end;
$$;

create unique index if not exists expenses_client_request_id_idx
  on public.expenses(client_request_id)
  where client_request_id is not null;

drop function if exists public.create_expense(uuid, uuid, date, numeric, public.payment_method, text);
create or replace function public.create_expense(
  p_category_id uuid,
  p_employee_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_method public.payment_method,
  p_note text default null,
  p_client_request_id uuid default gen_random_uuid()
)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_category public.expense_categories;
  v_employee public.employees;
  v_expense public.expenses;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่บันทึกรายจ่ายได้'; end if;
  select * into v_expense from public.expenses where client_request_id = p_client_request_id;
  if found then return v_expense; end if;
  if p_expense_date is null or p_amount is null or p_amount <= 0 then raise exception 'วันที่และจำนวนเงินไม่ถูกต้อง'; end if;
  select * into v_category from public.expense_categories where id = p_category_id and active;
  if not found then raise exception 'ไม่พบประเภทรายจ่ายที่เปิดใช้งาน'; end if;
  if v_category.requires_employee_name then
    if p_employee_id is null then raise exception 'รายจ่ายประเภทนี้ต้องระบุพนักงาน'; end if;
    select * into v_employee from public.employees where id = p_employee_id and active;
    if not found then raise exception 'ไม่พบรายชื่อพนักงานที่เปิดใช้งาน'; end if;
  elsif p_employee_id is not null then
    select * into v_employee from public.employees where id = p_employee_id and active;
  end if;
  insert into public.expenses(
    category_id, category_name_snapshot, employee_id, employee_name_snapshot,
    expense_date, amount, method, note, created_by, client_request_id
  ) values (
    v_category.id, v_category.name, v_employee.id, v_employee.name,
    p_expense_date, round(p_amount, 2), p_method,
    nullif(btrim(coalesce(p_note, '')), ''), v_user_id, p_client_request_id
  ) returning * into v_expense;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense', v_expense.id, 'create', jsonb_build_object('amount', v_expense.amount, 'date', v_expense.expense_date));
  return v_expense;
exception
  when unique_violation then
    select * into v_expense from public.expenses where client_request_id = p_client_request_id;
    if found then return v_expense; end if;
    raise;
end;
$$;

drop function if exists public.list_expenses(date, date, uuid);
create or replace function public.list_expenses(p_from date, p_to date, p_category_id uuid default null)
returns table (
  id uuid, category_id uuid, category_name text, employee_id uuid, employee_name text,
  expense_date date, amount numeric, method public.payment_method, note text,
  status public.expense_status, attachment_id uuid, attachment_path text,
  attachment_file_name text, evidence_status text, evidence_last_error text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return query
    select e.id, e.category_id, e.category_name_snapshot, e.employee_id, e.employee_name_snapshot,
      e.expense_date, e.amount, e.method, e.note, e.status, a.id, a.storage_path, a.file_name,
      e.evidence_status, e.evidence_last_error
    from public.expenses e
    left join public.expense_attachments a on a.expense_id = e.id
    where e.expense_date between p_from and p_to
      and (p_category_id is null or e.category_id = p_category_id)
    order by e.expense_date desc, e.created_at desc, e.id desc;
end;
$$;

create or replace function public.mark_expense_attachment_failed(p_expense_id uuid, p_error text)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_expense public.expenses; v_user_id uuid := public.require_active_user();
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  update public.expenses set evidence_status = 'failed', evidence_last_error = left(coalesce(nullif(btrim(p_error), ''), 'แนบหลักฐานไม่สำเร็จ'), 500)
  where id = p_expense_id returning * into v_expense;
  if not found then raise exception 'ไม่พบรายจ่าย'; end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense', p_expense_id, 'attachment_failed', jsonb_build_object('error', v_expense.evidence_last_error));
  return v_expense;
end;
$$;

create or replace function public.add_expense_attachment(
  p_expense_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_file_size integer
)
returns public.expense_attachments
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_attachment public.expense_attachments;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'application/pdf') or p_file_size <= 0 or p_file_size > 5242880 then raise exception 'ชนิดหรือขนาดไฟล์ไม่ถูกต้อง'; end if;
  if not exists (select 1 from public.expenses where id = p_expense_id) then raise exception 'ไม่พบรายจ่าย'; end if;
  select * into v_attachment from public.expense_attachments where expense_id = p_expense_id;
  if found then return v_attachment; end if;
  insert into public.expense_attachments(expense_id, storage_path, file_name, mime_type, file_size, uploaded_by)
  values (p_expense_id, p_storage_path, left(p_file_name, 255), p_mime_type, p_file_size, v_user_id)
  returning * into v_attachment;
  update public.expenses set evidence_status = 'uploaded', evidence_last_error = null where id = p_expense_id;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense', p_expense_id, 'attachment_add', jsonb_build_object('file_name', p_file_name));
  return v_attachment;
exception
  when unique_violation then
    select * into v_attachment from public.expense_attachments where expense_id = p_expense_id;
    if found then return v_attachment; end if;
    raise;
end;
$$;

create or replace function public.list_sales_tables()
returns table (
  id uuid, table_number text, display_name text, has_open_order boolean,
  open_order_id uuid, is_owned_by_current_user boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  return query
    select t.id, t.table_number, coalesce(t.display_name, t.table_number),
      o.id is not null,
      case when o.opened_by = auth.uid() or public.is_manager() then o.id else null end,
      coalesce(o.opened_by = auth.uid(), false)
    from public.dining_tables t
    left join public.orders o on o.table_id = t.id and o.status = 'open'
    where t.active
    order by nullif(regexp_replace(t.table_number, '[^0-9]', '', 'g'), '')::integer nulls last, t.table_number;
end;
$$;

revoke all on function public.create_expense(uuid, uuid, date, numeric, public.payment_method, text, uuid) from public;
revoke all on function public.list_expenses(date, date, uuid) from public;
revoke all on function public.mark_expense_attachment_failed(uuid, text) from public;
revoke all on function public.add_expense_attachment(uuid, text, text, text, integer) from public;
revoke all on function public.list_sales_tables() from public;
grant execute on function public.create_expense(uuid, uuid, date, numeric, public.payment_method, text, uuid) to authenticated;
grant execute on function public.list_expenses(date, date, uuid) to authenticated;
grant execute on function public.mark_expense_attachment_failed(uuid, text) to authenticated;
grant execute on function public.add_expense_attachment(uuid, text, text, text, integer) to authenticated;
grant execute on function public.list_sales_tables() to authenticated;
