-- Phase 9.1: save general expenses and daily wages through one atomic command.

drop function if exists public.create_general_expense(date, numeric, text, uuid);
drop function if exists public.save_daily_wages(date, uuid[]);

alter table public.expenses add column if not exists client_request_payload text;

create or replace function public.save_expense_and_daily_wages(
  p_date date,
  p_general_amount numeric default null,
  p_general_note text default null,
  p_employee_ids uuid[] default null,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_general public.expenses;
  v_existing_general public.expenses;
  v_employee public.employees;
  v_id uuid;
  v_new_id uuid;
  v_wages jsonb := '[]'::jsonb;
  v_general_note text := nullif(btrim(coalesce(p_general_note, '')), '');
  v_request_payload text;
  v_has_general boolean := p_general_amount is not null;
  v_has_wages boolean := p_employee_ids is not null;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_date is null then raise exception 'ต้องระบุวันที่'; end if;
  if not v_has_general and not v_has_wages then raise exception 'ต้องกรอกข้อมูลรายจ่ายหรือเลือกพนักงานอย่างน้อยหนึ่งรายการ'; end if;
  if v_has_general and (p_general_amount is null or p_general_amount <= 0) then raise exception 'จำนวนเงินรายจ่ายต้องมากกว่า 0 บาท'; end if;
  if v_has_general and p_client_request_id is null then raise exception 'ไม่พบรหัสคำขอบันทึกรายจ่าย'; end if;
  if v_has_wages and exists (select 1 from unnest(coalesce(p_employee_ids, '{}')) ids where ids is null) then
    raise exception 'รายการพนักงานไม่ถูกต้อง';
  end if;
  if v_has_general then
    v_request_payload := p_date::text || '|' || round(p_general_amount, 2)::text || '|' || coalesce(v_general_note, '') || '|wages=' ||
      case when not v_has_wages then '<not-saved>' else coalesce((select string_agg(ids::text, ',' order by ids::text) from unnest(coalesce(p_employee_ids, '{}')) ids), '<clear-all>') end;
  end if;

  if v_has_general then
    select * into v_existing_general
    from public.expenses
    where kind = 'general' and client_request_id = p_client_request_id
    for update;
    if found then
      if v_existing_general.expense_date <> p_date
        or v_existing_general.amount <> round(p_general_amount, 2)
        or v_existing_general.note is distinct from v_general_note
        or v_existing_general.client_request_payload is distinct from v_request_payload then
        raise exception 'รหัสคำขอเดิมมีข้อมูลไม่ตรงกัน';
      end if;
      v_general := v_existing_general;
    else
      insert into public.expenses(kind, expense_date, amount, note, created_by, client_request_id, client_request_payload)
      values ('general', p_date, round(p_general_amount, 2), v_general_note, v_user_id, p_client_request_id, v_request_payload)
      returning * into v_general;
      insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
      values (v_user_id, 'expense', v_general.id, 'create', jsonb_build_object(
        'kind', 'general', 'amount', v_general.amount, 'date', v_general.expense_date
      ));
    end if;
  end if;

  if v_has_wages then
    perform pg_advisory_xact_lock(hashtextextended('daily-wage:' || p_date::text, 0));
    if exists (
      select 1 from unnest(coalesce(p_employee_ids, '{}')) ids
      group by ids having count(*) > 1
    ) then raise exception 'มีพนักงานซ้ำในรายการ'; end if;

    foreach v_id in array coalesce(p_employee_ids, '{}') loop
      select * into v_employee from public.employees where id = v_id and active for update;
      if not found then
        if not exists (
          select 1 from public.expenses
          where kind = 'wage' and employee_id = v_id and expense_date = p_date and status = 'active'
        ) then raise exception 'พบพนักงานที่ไม่เปิดใช้งานหรือไม่มีอยู่ในระบบ'; end if;
      elsif not exists (
        select 1 from public.expenses
        where kind = 'wage' and employee_id = v_id and expense_date = p_date and status = 'active'
      ) then
        insert into public.expenses(kind, employee_id, employee_name_snapshot, daily_wage_snapshot, expense_date, amount, created_by)
        values ('wage', v_employee.id, v_employee.name, v_employee.daily_wage, p_date, v_employee.daily_wage, v_user_id)
        returning id into v_new_id;
        insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
        values (v_user_id, 'expense', v_new_id, 'wage_create', jsonb_build_object(
          'date', p_date, 'employee_id', v_employee.id, 'amount', v_employee.daily_wage
        ));
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
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) into v_wages
  from (
    select * from public.expenses
    where kind = 'wage' and expense_date = p_date and status = 'active'
  ) x;

  return jsonb_build_object(
    'date', p_date,
    'general_expense', case when v_general is null then null else to_jsonb(v_general) end,
    'wages', v_wages,
    'general_saved', v_has_general,
    'wages_saved', v_has_wages,
    'total_amount', coalesce(v_general.amount, 0) + coalesce((select sum((item ->> 'amount')::numeric) from jsonb_array_elements(v_wages) item), 0)
  );
exception when unique_violation then
  if v_has_general and p_client_request_id is not null then
    select * into v_existing_general from public.expenses
    where kind = 'general' and client_request_id = p_client_request_id;
    if found then
      if v_existing_general.expense_date <> p_date
        or v_existing_general.amount <> round(p_general_amount, 2)
        or v_existing_general.note is distinct from v_general_note
        or v_existing_general.client_request_payload is distinct from v_request_payload then
        raise exception 'รหัสคำขอเดิมมีข้อมูลไม่ตรงกัน';
      end if;
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) into v_wages
      from (select * from public.expenses where kind = 'wage' and expense_date = p_date and status = 'active') x;
      return jsonb_build_object('date', p_date, 'general_expense', to_jsonb(v_existing_general), 'wages', v_wages,
        'general_saved', true, 'wages_saved', v_has_wages,
        'total_amount', v_existing_general.amount + coalesce((select sum((item ->> 'amount')::numeric) from jsonb_array_elements(v_wages) item), 0));
    end if;
  end if;
  raise;
end;
$$;

revoke all on function public.save_expense_and_daily_wages(date, numeric, text, uuid[], uuid) from public;
grant execute on function public.save_expense_and_daily_wages(date, numeric, text, uuid[], uuid) to authenticated;
