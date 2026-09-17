-- Phase 6A: count only non-refunded paid bills in paid_order_count.

create or replace function public.get_sales_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_summary jsonb;
  v_products jsonb;
  v_sellers jsonb;
  v_tables jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'ช่วงวันที่ไม่ถูกต้อง';
  end if;

  with scoped_orders as (
    select o.* from public.orders o
    where o.closed_at >= p_from and o.closed_at < p_to
      and (o.opened_by = v_user_id or public.is_manager())
  ), sales as (
    select * from scoped_orders where status in ('paid', 'refunded')
  ), refund_totals as (
    select coalesce(sum(r.amount), 0) as amount
    from public.refunds r join sales s on s.id = r.order_id
  )
  select jsonb_build_object(
    'paid_order_count', (select count(*) from scoped_orders where status = 'paid'),
    'void_order_count', (select count(*) from scoped_orders where status = 'void'),
    'refunded_order_count', (select count(*) from scoped_orders where status = 'refunded'),
    'sales_total', coalesce((select sum(total) from sales), 0),
    'discount_total', coalesce((select sum(discount) from sales), 0),
    'refund_total', (select amount from refund_totals),
    'net_total', coalesce((select sum(total) from sales), 0) - (select amount from refund_totals),
    'cash_total', coalesce((select sum(p.amount) from public.payments p join sales s on s.id = p.order_id where p.method = 'cash'), 0),
    'transfer_total', coalesce((select sum(p.amount) from public.payments p join sales s on s.id = p.order_id where p.method = 'transfer'), 0)
  ) into v_summary;

  with sales as (
    select o.id from public.orders o where o.closed_at >= p_from and o.closed_at < p_to
      and o.status in ('paid', 'refunded') and (o.opened_by = v_user_id or public.is_manager())
  ), grouped as (
    select oi.product_name_snapshot as product_name, oi.category_name_snapshot as category_name,
      sum(oi.quantity) as quantity, sum(oi.line_total) as total
    from public.order_items oi join sales s on s.id = oi.order_id
    group by oi.product_name_snapshot, oi.category_name_snapshot
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by total desc), '[]'::jsonb) into v_products from grouped;

  with sales as (
    select o.opened_by, o.total from public.orders o where o.closed_at >= p_from and o.closed_at < p_to
      and o.status in ('paid', 'refunded') and (o.opened_by = v_user_id or public.is_manager())
  ), grouped as (
    select s.opened_by, coalesce(pr.display_name, 'ไม่ระบุ') as seller_name, count(*) as bill_count, sum(s.total) as total
    from sales s left join public.profiles pr on pr.id = s.opened_by group by s.opened_by, pr.display_name
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by total desc), '[]'::jsonb) into v_sellers from grouped;

  with sales as (
    select o.table_id, o.total from public.orders o where o.closed_at >= p_from and o.closed_at < p_to
      and o.status in ('paid', 'refunded') and (o.opened_by = v_user_id or public.is_manager())
  ), grouped as (
    select s.table_id, coalesce(t.display_name, t.table_number, 'ไม่ระบุ') as table_name, count(*) as bill_count, sum(s.total) as total
    from sales s left join public.dining_tables t on t.id = s.table_id group by s.table_id, t.display_name, t.table_number
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by total desc), '[]'::jsonb) into v_tables from grouped;

  return jsonb_build_object('summary', v_summary, 'products', v_products, 'sellers', v_sellers, 'tables', v_tables);
end;
$$;
