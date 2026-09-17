-- Phase 9: replace the experimental category/attachment ledger with a cash-only
-- general-expense and daily-wage ledger.

drop function if exists public.list_expense_categories();
drop function if exists public.save_expense_category(uuid, text, boolean);
drop function if exists public.set_expense_category_active(uuid, boolean);
drop function if exists public.list_employees();
drop function if exists public.save_employee(uuid, text);
drop function if exists public.save_employee(uuid, text, numeric);
drop function if exists public.set_employee_active(uuid, boolean);
drop function if exists public.create_expense(uuid, uuid, date, numeric, public.payment_method, text, uuid);
drop function if exists public.create_expense(uuid, uuid, date, numeric, public.payment_method, text);
drop function if exists public.update_expense(uuid, uuid, uuid, date, numeric, public.payment_method, text, text);
drop function if exists public.list_expenses(date, date, uuid);
drop function if exists public.list_expenses_page(date, date, uuid, date, timestamptz, uuid, integer);
drop function if exists public.add_expense_attachment(uuid, text, text, text, integer);
drop function if exists public.mark_expense_attachment_failed(uuid, text);
drop function if exists public.get_expense_attachment_url(text);
drop function if exists public.void_expense(uuid, text);
drop function if exists public.get_financial_report(timestamptz, timestamptz);

drop table if exists public.expense_attachments;
drop table if exists public.expenses;
drop table if exists public.expense_categories;
drop table if exists public.employees;

-- Storage tables are protected by Supabase and cannot be deleted directly from SQL.
-- The unused bucket can be removed later through the Storage API or Dashboard.
drop policy if exists "expense evidence manager read" on storage.objects;
drop policy if exists "expense evidence manager insert" on storage.objects;
drop policy if exists "expense evidence manager delete" on storage.objects;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  daily_wage numeric(12,2) not null check (daily_wage > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.expense_kind as enum ('general', 'wage');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  kind public.expense_kind not null,
  employee_id uuid references public.employees(id),
  employee_name_snapshot text,
  daily_wage_snapshot numeric(12,2),
  expense_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  note text,
  status public.expense_status not null default 'active',
  void_reason text,
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_request_id uuid,
  check (method = 'cash'),
  check ((kind = 'general' and employee_id is null and employee_name_snapshot is null and daily_wage_snapshot is null)
      or (kind = 'wage' and employee_id is not null and length(btrim(coalesce(employee_name_snapshot, ''))) > 0 and daily_wage_snapshot > 0)),
  check ((status = 'active' and void_reason is null and voided_by is null and voided_at is null)
      or (status = 'void' and length(btrim(coalesce(void_reason, ''))) > 0 and voided_by is not null and voided_at is not null))
);

create unique index expenses_general_request_idx
  on public.expenses(client_request_id)
  where kind = 'general' and client_request_id is not null;
create unique index expenses_active_wage_employee_date_idx
  on public.expenses(employee_id, expense_date)
  where kind = 'wage' and status = 'active';
create index expenses_history_cursor_idx
  on public.expenses(expense_date desc, created_at desc, id desc);
create index expenses_kind_date_idx on public.expenses(kind, expense_date, status);

drop trigger if exists employees_updated_at_trigger on public.employees;
create trigger employees_updated_at_trigger before update on public.employees
for each row execute procedure public.set_updated_at();
drop trigger if exists expenses_updated_at_trigger on public.expenses;
create trigger expenses_updated_at_trigger before update on public.expenses
for each row execute procedure public.set_updated_at();

create or replace function public.list_employees()
returns setof public.employees
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  return query select * from public.employees order by active desc, name;
end;
$$;

create or replace function public.save_employee(p_id uuid, p_name text, p_daily_wage numeric)
returns public.employees
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_employee public.employees;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or p_daily_wage is null or p_daily_wage <= 0 then
    raise exception 'ต้องระบุชื่อและค่าแรงที่มากกว่า 0';
  end if;
  if p_id is null then
    insert into public.employees(name, daily_wage) values (btrim(p_name), round(p_daily_wage, 2)) returning * into v_employee;
  else
    update public.employees set name = btrim(p_name), daily_wage = round(p_daily_wage, 2)
    where id = p_id returning * into v_employee;
    if not found then raise exception 'ไม่พบรายชื่อพนักงาน'; end if;
  end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'employee', v_employee.id, case when p_id is null then 'create' else 'update' end,
    jsonb_build_object('name', v_employee.name, 'daily_wage', v_employee.daily_wage));
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

create or replace function public.create_general_expense(
  p_expense_date date, p_amount numeric, p_note text default null,
  p_client_request_id uuid default gen_random_uuid()
)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_expense public.expenses;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่บันทึกรายจ่ายได้'; end if;
  select * into v_expense from public.expenses where kind = 'general' and client_request_id = p_client_request_id;
  if found then return v_expense; end if;
  if p_expense_date is null or p_amount is null or p_amount <= 0 then raise exception 'วันที่และจำนวนเงินไม่ถูกต้อง'; end if;
  insert into public.expenses(kind, expense_date, amount, note, created_by, client_request_id)
  values ('general', p_expense_date, round(p_amount, 2), nullif(btrim(coalesce(p_note, '')), ''), v_user_id, p_client_request_id)
  returning * into v_expense;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense', v_expense.id, 'create', jsonb_build_object('kind', 'general', 'amount', v_expense.amount, 'date', v_expense.expense_date));
  return v_expense;
exception when unique_violation then
  select * into v_expense from public.expenses where kind = 'general' and client_request_id = p_client_request_id;
  if found then return v_expense; end if;
  raise;
end;
$$;

create or replace function public.list_daily_wages(p_date date)
returns table (
  employee_id uuid, employee_name text, daily_wage numeric, employee_active boolean,
  expense_id uuid, selected boolean, status public.expense_status
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_date is null then raise exception 'ต้องระบุวันที่'; end if;
  return query
  select e.id, e.name, e.daily_wage, e.active, x.id, coalesce(x.status = 'active', false), x.status
  from public.employees e
  left join lateral (
    select w.id, w.status
    from public.expenses w
    where w.kind = 'wage' and w.employee_id = e.id and w.expense_date = p_date
    order by (w.status = 'active') desc, w.created_at desc
    limit 1
  ) x on true
  order by e.active desc, e.name;
end;
$$;

create or replace function public.save_daily_wages(p_date date, p_employee_ids uuid[] default '{}')
returns setof public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_employee public.employees;
  v_id uuid;
  v_new_id uuid;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_date is null then raise exception 'ต้องระบุวันที่'; end if;
  perform pg_advisory_xact_lock(hashtextextended('daily-wage:' || p_date::text, 0));

  if exists (
    select 1 from unnest(coalesce(p_employee_ids, '{}')) ids
    group by ids having count(*) > 1
  ) then raise exception 'มีพนักงานซ้ำในรายการ'; end if;

  foreach v_id in array coalesce(p_employee_ids, '{}') loop
    select * into v_employee from public.employees where id = v_id and active for update;
    if not found then
      if not exists (select 1 from public.expenses where kind = 'wage' and employee_id = v_id and expense_date = p_date and status = 'active') then
        raise exception 'พบพนักงานที่ไม่เปิดใช้งานหรือไม่มีอยู่ในระบบ';
      end if;
    else
      if not exists (select 1 from public.expenses where kind = 'wage' and employee_id = v_id and expense_date = p_date and status = 'active') then
        insert into public.expenses(kind, employee_id, employee_name_snapshot, daily_wage_snapshot, expense_date, amount, created_by)
        values ('wage', v_employee.id, v_employee.name, v_employee.daily_wage, p_date, v_employee.daily_wage, v_user_id)
        returning id into v_new_id;
        insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
        values (v_user_id, 'expense', v_new_id, 'wage_create', jsonb_build_object('date', p_date, 'employee_id', v_employee.id));
      end if;
    end if;
  end loop;

  with voided as (
    update public.expenses w
    set status = 'void', void_reason = 'ยกเลิกจากการปรับรายชื่อผู้มาทำงาน', voided_by = v_user_id, voided_at = now()
    where w.kind = 'wage' and w.expense_date = p_date and w.status = 'active'
      and not (w.employee_id = any(coalesce(p_employee_ids, '{}')))
    returning w.id, w.employee_id
  )
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  select v_user_id, 'expense', id, 'wage_void', jsonb_build_object('date', p_date, 'employee_id', employee_id)
  from voided;

  return query select * from public.expenses where kind = 'wage' and expense_date = p_date and status = 'active' order by created_at;
end;
$$;

create or replace function public.void_expense(p_id uuid, p_reason text)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_expense public.expenses;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'ต้องระบุเหตุผลการยกเลิก'; end if;
  update public.expenses set status = 'void', void_reason = btrim(p_reason), voided_by = v_user_id, voided_at = now()
  where id = p_id and status = 'active' returning * into v_expense;
  if not found then raise exception 'ไม่พบรายการรายจ่ายที่ยกเลิกได้'; end if;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'expense', p_id, 'void', jsonb_build_object('reason', v_expense.void_reason));
  return v_expense;
end;
$$;

create or replace function public.list_expenses_page(
  p_from date, p_to date, p_cursor_date date default null,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null,
  p_limit integer default 25
)
returns table (
  id uuid, kind public.expense_kind, employee_id uuid, employee_name text,
  expense_date date, amount numeric, note text, status public.expense_status,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_page_size integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return query
  select e.id, e.kind, e.employee_id, e.employee_name_snapshot, e.expense_date,
    e.amount, e.note, e.status, e.created_at
  from public.expenses e
  where e.expense_date between p_from and p_to
    and (p_cursor_date is null or (e.expense_date, e.created_at, e.id) < (p_cursor_date, p_cursor_created_at, p_cursor_id))
  order by e.expense_date desc, e.created_at desc, e.id desc
  limit v_page_size + 1;
end;
$$;

create or replace function public.get_financial_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user(); v_sales jsonb;
  v_total numeric; v_general numeric; v_wages numeric; v_by_kind jsonb; v_by_employee jsonb;
  v_from_date date; v_to_date date;
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  v_from_date := (p_from at time zone 'Asia/Bangkok')::date;
  v_to_date := (p_to at time zone 'Asia/Bangkok')::date - 1;
  v_sales := public.get_sales_report(p_from, p_to);
  if public.is_manager() then
    select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where kind = 'general'), 0), coalesce(sum(amount) filter (where kind = 'wage'), 0)
      into v_total, v_general, v_wages
    from public.expenses where status = 'active' and expense_date between v_from_date and v_to_date;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) into v_by_kind
      from (select case when kind = 'wage' then 'ค่าแรงพนักงาน' else 'รายจ่ายทั่วไป' end as category_name, sum(amount) as total
        from public.expenses where status = 'active' and expense_date between v_from_date and v_to_date group by kind) x;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) into v_by_employee
      from (select employee_name_snapshot as employee_name, sum(amount) as total from public.expenses
        where status = 'active' and kind = 'wage' and expense_date between v_from_date and v_to_date
        group by employee_name_snapshot) x;
  else
    v_total := 0; v_general := 0; v_wages := 0; v_by_kind := '[]'::jsonb; v_by_employee := '[]'::jsonb;
  end if;
  return jsonb_build_object(
    'sales', v_sales,
    'expenses', jsonb_build_object('total', v_total, 'cash_total', v_total, 'transfer_total', 0,
      'general_total', v_general, 'wage_total', v_wages, 'by_category', v_by_kind, 'by_employee', v_by_employee),
    'net_after_expenses', ((v_sales -> 'summary' ->> 'net_total')::numeric - v_total)
  );
end;
$$;

revoke all on table public.employees, public.expenses from anon, authenticated;
alter table public.employees enable row level security;
alter table public.expenses enable row level security;

revoke all on function public.list_employees() from public;
revoke all on function public.save_employee(uuid, text, numeric) from public;
revoke all on function public.set_employee_active(uuid, boolean) from public;
revoke all on function public.create_general_expense(date, numeric, text, uuid) from public;
revoke all on function public.list_daily_wages(date) from public;
revoke all on function public.save_daily_wages(date, uuid[]) from public;
revoke all on function public.void_expense(uuid, text) from public;
revoke all on function public.list_expenses_page(date, date, date, timestamptz, uuid, integer) from public;
revoke all on function public.get_financial_report(timestamptz, timestamptz) from public;
grant execute on function public.list_employees() to authenticated;
grant execute on function public.save_employee(uuid, text, numeric) to authenticated;
grant execute on function public.set_employee_active(uuid, boolean) to authenticated;
grant execute on function public.create_general_expense(date, numeric, text, uuid) to authenticated;
grant execute on function public.list_daily_wages(date) to authenticated;
grant execute on function public.save_daily_wages(date, uuid[]) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.list_expenses_page(date, date, date, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_financial_report(timestamptz, timestamptz) to authenticated;
