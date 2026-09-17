-- Phase 6C: bounded server-side pages for long-running ledgers.

create index if not exists orders_history_cursor_idx on public.orders(closed_at desc, id desc);
create index if not exists expenses_history_cursor_idx on public.expenses(expense_date desc, created_at desc, id desc);

create or replace function public.list_sales_history_page(
  p_from timestamptz, p_to timestamptz, p_order_number bigint default null,
  p_cursor_closed_at timestamptz default null, p_cursor_order_id uuid default null,
  p_limit integer default 25
)
returns table (
  order_id uuid, order_number bigint, table_name text, status public.order_status,
  receipt_mode public.receipt_mode, subtotal numeric, discount numeric, total numeric,
  opened_by uuid, closed_at timestamptz, payment_method public.payment_method,
  refund_amount numeric, receipt_id uuid
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user(); v_page_size integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return query
  select o.id, o.order_number, coalesce(t.display_name, t.table_number, 'ไม่ระบุ'), o.status, o.receipt_mode,
    o.subtotal, o.discount, o.total, o.opened_by, o.closed_at, p.method, coalesce(r.amount, 0), rc.id
  from public.orders o
  left join public.dining_tables t on t.id = o.table_id
  left join public.payments p on p.order_id = o.id
  left join public.refunds r on r.order_id = o.id
  left join lateral (select receipts.id from public.receipts where receipts.order_id = o.id order by print_number desc limit 1) rc on true
  where o.closed_at >= p_from and o.closed_at < p_to
    and (o.opened_by = v_user_id or public.is_manager())
    and (p_order_number is null or o.order_number = p_order_number)
    and (p_cursor_closed_at is null or (o.closed_at, o.id) < (p_cursor_closed_at, p_cursor_order_id))
  order by o.closed_at desc, o.id desc
  limit v_page_size + 1;
end;
$$;

drop function if exists public.list_expenses_page(date, date, uuid, date, timestamptz, uuid, integer);
create or replace function public.list_expenses_page(
  p_from date, p_to date, p_category_id uuid default null,
  p_cursor_date date default null, p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null, p_limit integer default 25
)
returns table (
  id uuid, category_id uuid, category_name text, employee_id uuid, employee_name text,
  expense_date date, amount numeric, method public.payment_method, note text,
  status public.expense_status, attachment_id uuid, attachment_path text,
  attachment_file_name text, evidence_status text, evidence_last_error text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_page_size integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return query
  select e.id, e.category_id, e.category_name_snapshot, e.employee_id, e.employee_name_snapshot,
    e.expense_date, e.amount, e.method, e.note, e.status, a.id, a.storage_path, a.file_name,
    e.evidence_status, e.evidence_last_error, e.created_at
  from public.expenses e
  left join public.expense_attachments a on a.expense_id = e.id
  where e.expense_date between p_from and p_to
    and (p_category_id is null or e.category_id = p_category_id)
    and (p_cursor_date is null or (e.expense_date, e.created_at, e.id) < (p_cursor_date, p_cursor_created_at, p_cursor_id))
  order by e.expense_date desc, e.created_at desc, e.id desc
  limit v_page_size + 1;
end;
$$;

revoke all on function public.list_sales_history_page(timestamptz, timestamptz, bigint, timestamptz, uuid, integer) from public;
revoke all on function public.list_expenses_page(date, date, uuid, date, timestamptz, uuid, integer) from public;
grant execute on function public.list_sales_history_page(timestamptz, timestamptz, bigint, timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_expenses_page(date, date, uuid, date, timestamptz, uuid, integer) to authenticated;
