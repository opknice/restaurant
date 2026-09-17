-- Phase 5: manager-only expense ledger and combined financial report.

create type public.expense_status as enum ('active', 'void');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  requires_employee_name boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories(id),
  category_name_snapshot text not null,
  employee_id uuid references public.employees(id),
  employee_name_snapshot text,
  expense_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  note text,
  status public.expense_status not null default 'active',
  void_reason text,
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and void_reason is null and voided_by is null and voided_at is null)
      or (status = 'void' and length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);

create table public.expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null unique references public.expenses(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  file_size integer not null check (file_size > 0 and file_size <= 5242880),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index expenses_date_status_idx on public.expenses(expense_date, status);
create index expenses_category_idx on public.expenses(category_id, expense_date);
create index expenses_employee_idx on public.expenses(employee_id, expense_date);

drop trigger if exists expense_categories_updated_at_trigger on public.expense_categories;
create trigger expense_categories_updated_at_trigger before update on public.expense_categories
for each row execute procedure public.set_updated_at();
drop trigger if exists employees_updated_at_trigger on public.employees;
create trigger employees_updated_at_trigger before update on public.employees
for each row execute procedure public.set_updated_at();
drop trigger if exists expenses_updated_at_trigger on public.expenses;
create trigger expenses_updated_at_trigger before update on public.expenses
for each row execute procedure public.set_updated_at();

create or replace function public.list_expense_categories()
returns setof public.expense_categories
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  return query select * from public.expense_categories order by sort_order, name;
end;
$$;

create or replace function public.save_expense_category(p_id uuid, p_name text, p_requires_employee_name boolean default false)
returns public.expense_categories
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_category public.expense_categories;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'ต้องระบุชื่อประเภทรายจ่าย'; end if;
  if p_id is null then
    insert into public.expense_categories(name, requires_employee_name) values (btrim(p_name), p_requires_employee_name) returning * into v_category;
  else
    update public.expense_categories set name = btrim(p_name), requires_employee_name = p_requires_employee_name where id = p_id returning * into v_category;
    if not found then raise exception 'ไม่พบประเภทรายจ่าย'; end if;
  end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense_category', v_category.id, case when p_id is null then 'create' else 'update' end, jsonb_build_object('name', v_category.name));
  return v_category;
end;
$$;

create or replace function public.set_expense_category_active(p_id uuid, p_active boolean)
returns public.expense_categories
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_category public.expense_categories;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  update public.expense_categories set active = p_active where id = p_id returning * into v_category;
  if not found then raise exception 'ไม่พบประเภทรายจ่าย'; end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense_category', p_id, 'active_change', jsonb_build_object('active', p_active));
  return v_category;
end;
$$;

create or replace function public.list_employees()
returns setof public.employees
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  return query select * from public.employees order by name;
end;
$$;

create or replace function public.save_employee(p_id uuid, p_name text)
returns public.employees
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_employee public.employees;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'ต้องระบุชื่อพนักงาน'; end if;
  if p_id is null then
    insert into public.employees(name) values (btrim(p_name)) returning * into v_employee;
  else
    update public.employees set name = btrim(p_name) where id = p_id returning * into v_employee;
    if not found then raise exception 'ไม่พบรายชื่อพนักงาน'; end if;
  end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'employee', v_employee.id, case when p_id is null then 'create' else 'update' end, jsonb_build_object('name', v_employee.name));
  return v_employee;
end;
$$;

create or replace function public.set_employee_active(p_id uuid, p_active boolean)
returns public.employees
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_employee public.employees;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  update public.employees set active = p_active where id = p_id returning * into v_employee;
  if not found then raise exception 'ไม่พบรายชื่อพนักงาน'; end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'employee', p_id, 'active_change', jsonb_build_object('active', p_active));
  return v_employee;
end;
$$;

create or replace function public.create_expense(
  p_category_id uuid, p_employee_id uuid, p_expense_date date, p_amount numeric,
  p_method public.payment_method, p_note text default null
)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user(); v_category public.expense_categories; v_employee public.employees; v_expense public.expenses;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่บันทึกรายจ่ายได้'; end if;
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
  insert into public.expenses(category_id, category_name_snapshot, employee_id, employee_name_snapshot, expense_date, amount, method, note, created_by)
  values (v_category.id, v_category.name, v_employee.id, v_employee.name, p_expense_date, round(p_amount, 2), p_method, nullif(btrim(coalesce(p_note, '')), ''), v_user_id)
  returning * into v_expense;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense', v_expense.id, 'create', jsonb_build_object('amount', v_expense.amount, 'date', v_expense.expense_date));
  return v_expense;
end;
$$;

create or replace function public.update_expense(
  p_id uuid, p_category_id uuid, p_employee_id uuid, p_expense_date date, p_amount numeric,
  p_method public.payment_method, p_note text, p_reason text
)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user(); v_category public.expense_categories; v_employee public.employees; v_expense public.expenses; v_before jsonb;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่แก้ไขรายจ่ายได้'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'ต้องระบุเหตุผลการแก้ไข'; end if;
  select * into v_expense from public.expenses where id = p_id and status = 'active' for update;
  if not found then raise exception 'ไม่พบรายจ่ายที่ยังใช้งาน'; end if;
  v_before := to_jsonb(v_expense);
  select * into v_category from public.expense_categories where id = p_category_id and active;
  if not found then raise exception 'ไม่พบประเภทรายจ่ายที่เปิดใช้งาน'; end if;
  if v_category.requires_employee_name then
    select * into v_employee from public.employees where id = p_employee_id and active;
    if not found then raise exception 'รายจ่ายประเภทนี้ต้องระบุพนักงาน'; end if;
  elsif p_employee_id is not null then
    select * into v_employee from public.employees where id = p_employee_id and active;
  end if;
  if p_expense_date is null or p_amount is null or p_amount <= 0 then raise exception 'วันที่และจำนวนเงินไม่ถูกต้อง'; end if;
  update public.expenses set category_id = v_category.id, category_name_snapshot = v_category.name, employee_id = v_employee.id, employee_name_snapshot = v_employee.name, expense_date = p_expense_date, amount = round(p_amount, 2), method = p_method, note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id returning * into v_expense;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, reason, metadata)
  values (v_user_id, 'expense', p_id, 'update', btrim(p_reason), jsonb_build_object('before', v_before, 'after', to_jsonb(v_expense)));
  return v_expense;
end;
$$;

create or replace function public.void_expense(p_id uuid, p_reason text)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_expense public.expenses;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่ยกเลิกรายจ่ายได้'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'ต้องระบุเหตุผลการยกเลิกรายจ่าย'; end if;
  update public.expenses set status = 'void', void_reason = btrim(p_reason), voided_by = v_user_id, voided_at = now() where id = p_id and status = 'active' returning * into v_expense;
  if not found then raise exception 'ไม่พบรายจ่ายที่ยังใช้งาน'; end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, reason) values (v_user_id, 'expense', p_id, 'void', btrim(p_reason));
  return v_expense;
end;
$$;

create or replace function public.list_expenses(p_from date, p_to date, p_category_id uuid default null)
returns table (id uuid, category_id uuid, category_name text, employee_id uuid, employee_name text, expense_date date, amount numeric, method public.payment_method, note text, status public.expense_status, attachment_id uuid, attachment_path text, attachment_file_name text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return query select e.id, e.category_id, e.category_name_snapshot, e.employee_id, e.employee_name_snapshot, e.expense_date, e.amount, e.method, e.note, e.status, a.id, a.storage_path, a.file_name
  from public.expenses e left join public.expense_attachments a on a.expense_id = e.id
  where e.expense_date between p_from and p_to and (p_category_id is null or e.category_id = p_category_id)
  order by e.expense_date desc, e.created_at desc;
end;
$$;

create or replace function public.add_expense_attachment(p_expense_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_file_size integer)
returns public.expense_attachments
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_attachment public.expense_attachments;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'application/pdf') or p_file_size <= 0 or p_file_size > 5242880 then raise exception 'ชนิดหรือขนาดไฟล์ไม่ถูกต้อง'; end if;
  if not exists (select 1 from public.expenses where id = p_expense_id) then raise exception 'ไม่พบรายจ่าย'; end if;
  insert into public.expense_attachments(expense_id, storage_path, file_name, mime_type, file_size, uploaded_by) values (p_expense_id, p_storage_path, left(p_file_name, 255), p_mime_type, p_file_size, v_user_id) returning * into v_attachment;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata) values (v_user_id, 'expense', p_expense_id, 'attachment_add', jsonb_build_object('file_name', p_file_name));
  return v_attachment;
end;
$$;

create or replace function public.get_financial_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_sales jsonb; v_expenses jsonb; v_from_date date; v_to_date date; v_total numeric; v_cash numeric; v_transfer numeric; v_by_category jsonb; v_by_employee jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  v_from_date := (p_from at time zone 'Asia/Bangkok')::date;
  v_to_date := (p_to at time zone 'Asia/Bangkok')::date - 1;
  v_sales := public.get_sales_report(p_from, p_to);
  if public.is_manager() then
    select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where method = 'cash'), 0), coalesce(sum(amount) filter (where method = 'transfer'), 0) into v_total, v_cash, v_transfer from public.expenses where status = 'active' and expense_date between v_from_date and v_to_date;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) into v_by_category from (select category_name_snapshot as category_name, sum(amount) as total from public.expenses where status = 'active' and expense_date between v_from_date and v_to_date group by category_name_snapshot) x;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) into v_by_employee from (select coalesce(employee_name_snapshot, 'ไม่ระบุ') as employee_name, sum(amount) as total from public.expenses where status = 'active' and expense_date between v_from_date and v_to_date group by employee_name_snapshot) x;
  else
    v_total := 0; v_cash := 0; v_transfer := 0; v_by_category := '[]'::jsonb; v_by_employee := '[]'::jsonb;
  end if;
  v_expenses := jsonb_build_object('total', v_total, 'cash_total', v_cash, 'transfer_total', v_transfer, 'by_category', v_by_category, 'by_employee', v_by_employee);
  return jsonb_build_object('sales', v_sales, 'expenses', v_expenses, 'net_after_expenses', ((v_sales -> 'summary' ->> 'net_total')::numeric - v_total));
end;
$$;

revoke all on table public.expense_categories, public.employees, public.expenses, public.expense_attachments from anon, authenticated;
alter table public.expense_categories enable row level security;
alter table public.employees enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_attachments enable row level security;

insert into storage.buckets (id, name, public) values ('expense-evidence', 'expense-evidence', false) on conflict (id) do nothing;
drop policy if exists "expense evidence manager read" on storage.objects;
drop policy if exists "expense evidence manager insert" on storage.objects;
drop policy if exists "expense evidence manager delete" on storage.objects;
create policy "expense evidence manager read" on storage.objects for select to authenticated using (bucket_id = 'expense-evidence' and public.is_active_user() and public.is_manager());
create policy "expense evidence manager insert" on storage.objects for insert to authenticated with check (bucket_id = 'expense-evidence' and public.is_active_user() and public.is_manager());
create policy "expense evidence manager delete" on storage.objects for delete to authenticated using (bucket_id = 'expense-evidence' and public.is_active_user() and public.is_manager());

revoke all on function public.list_expense_categories() from public;
revoke all on function public.save_expense_category(uuid, text, boolean) from public;
revoke all on function public.set_expense_category_active(uuid, boolean) from public;
revoke all on function public.list_employees() from public;
revoke all on function public.save_employee(uuid, text) from public;
revoke all on function public.set_employee_active(uuid, boolean) from public;
revoke all on function public.create_expense(uuid, uuid, date, numeric, public.payment_method, text) from public;
revoke all on function public.update_expense(uuid, uuid, uuid, date, numeric, public.payment_method, text, text) from public;
revoke all on function public.void_expense(uuid, text) from public;
revoke all on function public.list_expenses(date, date, uuid) from public;
revoke all on function public.add_expense_attachment(uuid, text, text, text, integer) from public;
revoke all on function public.get_financial_report(timestamptz, timestamptz) from public;
grant execute on function public.list_expense_categories() to authenticated;
grant execute on function public.save_expense_category(uuid, text, boolean) to authenticated;
grant execute on function public.set_expense_category_active(uuid, boolean) to authenticated;
grant execute on function public.list_employees() to authenticated;
grant execute on function public.save_employee(uuid, text) to authenticated;
grant execute on function public.set_employee_active(uuid, boolean) to authenticated;
grant execute on function public.create_expense(uuid, uuid, date, numeric, public.payment_method, text) to authenticated;
grant execute on function public.update_expense(uuid, uuid, uuid, date, numeric, public.payment_method, text, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.list_expenses(date, date, uuid) to authenticated;
grant execute on function public.add_expense_attachment(uuid, text, text, text, integer) to authenticated;
grant execute on function public.get_financial_report(timestamptz, timestamptz) to authenticated;
