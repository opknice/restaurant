-- Phase 10.3: expose separate create/update employee commands so generated
-- client types do not need to pass null into a required UUID argument.

create or replace function public.create_employee(p_name text, p_daily_wage numeric)
returns public.employees
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.save_employee(null, p_name, p_daily_wage);
end;
$$;

revoke all on function public.create_employee(text, numeric) from public, anon;
grant execute on function public.create_employee(text, numeric) to authenticated;
