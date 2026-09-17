-- Phase 9.2: provide a complete active-expense total independent of pagination.

create or replace function public.get_expense_total(p_from date, p_to date)
returns numeric
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return (select coalesce(sum(amount), 0) from public.expenses where status = 'active' and expense_date between p_from and p_to);
end;
$$;

revoke all on function public.get_expense_total(date, date) from public;
grant execute on function public.get_expense_total(date, date) to authenticated;
