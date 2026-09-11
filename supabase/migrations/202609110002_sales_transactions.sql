-- Phase 2: all sale mutations pass through these RPCs.  The browser never writes
-- directly to order, payment, refund, receipt, or audit tables.

create unique index orders_one_open_order_per_table_idx
  on public.orders (table_id)
  where status = 'open';

create unique index order_items_one_product_per_order_idx
  on public.order_items (order_id, product_id)
  where product_id is not null;

create or replace function public.require_active_user()
returns uuid
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles where id = v_user_id and active
  ) then
    raise exception 'บัญชีผู้ใช้ไม่มีสิทธิ์ใช้งาน';
  end if;
  return v_user_id;
end;
$$;

create or replace function public.require_order_access(p_order_id uuid, p_allow_manager boolean default true)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ไม่พบรายการบิล';
  end if;
  if v_order.opened_by <> v_user_id and not (p_allow_manager and public.is_manager()) then
    raise exception 'คุณไม่มีสิทธิ์จัดการบิลนี้';
  end if;
  return v_order;
end;
$$;

create or replace function public.recalculate_order_totals(p_order_id uuid)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ไม่พบรายการบิล';
  end if;

  select coalesce(round(sum(line_total), 2), 0) into v_subtotal
  from public.order_items where order_id = p_order_id;

  v_discount := case v_order.discount_type
    when 'percent' then round(v_subtotal * v_order.discount_value / 100, 2)
    when 'fixed' then v_order.discount_value
    else 0
  end;

  if v_discount > v_subtotal then
    raise exception 'ยอดส่วนลดสูงกว่ายอดอาหาร กรุณายกเลิกส่วนลดก่อนลดจำนวนรายการ';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_subtotal - v_discount
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.create_order(p_table_id uuid, p_receipt_mode public.receipt_mode default 'shop')
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
begin
  if not exists (select 1 from public.dining_tables where id = p_table_id and active) then
    raise exception 'ไม่พบโต๊ะที่เปิดใช้งาน';
  end if;

  select * into v_order from public.orders
  where table_id = p_table_id and status = 'open'
  for update;

  if found then
    if v_order.opened_by <> v_user_id and not public.is_manager() then
      raise exception 'โต๊ะนี้มีบิลค้างของผู้ใช้งานคนอื่น';
    end if;
    return v_order;
  end if;

  insert into public.orders (table_id, receipt_mode, opened_by)
  values (p_table_id, p_receipt_mode, v_user_id)
  returning * into v_order;

  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'order', v_order.id, 'create', jsonb_build_object('table_id', p_table_id));

  return v_order;
exception
  when unique_violation then
    select * into v_order from public.orders where table_id = p_table_id and status = 'open';
    if v_order.opened_by = v_user_id or public.is_manager() then
      return v_order;
    end if;
    raise exception 'โต๊ะนี้มีบิลค้างของผู้ใช้งานคนอื่น';
end;
$$;

create or replace function public.list_sales_tables()
returns table (
  id uuid,
  table_number text,
  display_name text,
  has_open_order boolean,
  open_order_id uuid,
  is_owned_by_current_user boolean
)
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select
    t.id,
    t.table_number,
    coalesce(t.display_name, t.table_number),
    o.id is not null,
    case when o.opened_by = auth.uid() or public.is_manager() then o.id else null end,
    coalesce(o.opened_by = auth.uid(), false)
  from public.dining_tables t
  left join public.orders o on o.table_id = t.id and o.status = 'open'
  where t.active
  order by nullif(regexp_replace(t.table_number, '[^0-9]', '', 'g'), '')::integer nulls last, t.table_number;
$$;

create or replace function public.add_order_item(p_order_id uuid, p_product_id uuid, p_quantity numeric default 1)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_order public.orders := public.require_order_access(p_order_id);
  v_product public.products;
begin
  if v_order.status <> 'open' then
    raise exception 'บิลนี้ปิดแล้ว ไม่สามารถเพิ่มรายการได้';
  end if;
  if p_quantity <= 0 then
    raise exception 'จำนวนรายการต้องมากกว่า 0';
  end if;

  select * into v_product from public.products where id = p_product_id and active;
  if not found then
    raise exception 'ไม่พบสินค้าที่เปิดขาย';
  end if;

  insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price, quantity, line_total)
  values (p_order_id, v_product.id, v_product.name, v_product.price, p_quantity, round(v_product.price * p_quantity, 2))
  on conflict (order_id, product_id) where product_id is not null do update
  set quantity = order_items.quantity + excluded.quantity,
      line_total = round(order_items.unit_price * (order_items.quantity + excluded.quantity), 2);

  return public.recalculate_order_totals(p_order_id);
end;
$$;

create or replace function public.set_order_item_quantity(p_item_id uuid, p_quantity numeric)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_unit_price numeric(12,2);
  v_order public.orders;
begin
  select oi.order_id, oi.unit_price into v_order_id, v_unit_price
  from public.order_items oi where oi.id = p_item_id;
  if not found then
    raise exception 'ไม่พบรายการอาหาร';
  end if;
  v_order := public.require_order_access(v_order_id);
  if v_order.status <> 'open' then
    raise exception 'บิลนี้ปิดแล้ว ไม่สามารถแก้ไขรายการได้';
  end if;

  if p_quantity <= 0 then
    delete from public.order_items where id = p_item_id;
  else
    update public.order_items
    set quantity = p_quantity, line_total = round(v_unit_price * p_quantity, 2)
    where id = p_item_id;
  end if;

  return public.recalculate_order_totals(v_order_id);
end;
$$;

create or replace function public.set_order_receipt_mode(p_order_id uuid, p_receipt_mode public.receipt_mode)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_order public.orders := public.require_order_access(p_order_id);
begin
  if v_order.status <> 'open' then
    raise exception 'บิลนี้ปิดแล้ว ไม่สามารถเปลี่ยนรูปแบบใบเสร็จได้';
  end if;
  update public.orders set receipt_mode = p_receipt_mode where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.apply_order_discount(
  p_order_id uuid,
  p_discount_type public.discount_type,
  p_discount_value numeric,
  p_reason text
)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
  v_discount numeric(12,2);
begin
  if not public.is_manager() then
    raise exception 'เฉพาะผู้จัดการเท่านั้นที่กำหนดส่วนลดได้';
  end if;
  v_order := public.require_order_access(p_order_id);
  if v_order.status <> 'open' then
    raise exception 'บิลนี้ปิดแล้ว ไม่สามารถกำหนดส่วนลดได้';
  end if;
  if p_discount_type not in ('percent', 'fixed') or p_discount_value <= 0 or length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'ส่วนลดต้องมีประเภท จำนวน และเหตุผล';
  end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then
    raise exception 'ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100';
  end if;

  v_discount := case p_discount_type
    when 'percent' then round(v_order.subtotal * p_discount_value / 100, 2)
    else p_discount_value
  end;
  if v_discount > v_order.subtotal then
    raise exception 'ยอดส่วนลดสูงกว่ายอดอาหาร';
  end if;

  update public.orders
  set discount_type = p_discount_type,
      discount_value = p_discount_value,
      discount = v_discount,
      discount_reason = btrim(p_reason),
      discount_applied_by = v_user_id,
      total = subtotal - v_discount
  where id = p_order_id
  returning * into v_order;

  insert into public.audit_events (actor_id, entity_type, entity_id, action, reason, metadata)
  values (v_user_id, 'order', p_order_id, 'discount_apply', btrim(p_reason), jsonb_build_object('type', p_discount_type, 'value', p_discount_value));
  return v_order;
end;
$$;

create or replace function public.clear_order_discount(p_order_id uuid)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
begin
  if not public.is_manager() then
    raise exception 'เฉพาะผู้จัดการเท่านั้นที่ยกเลิกส่วนลดได้';
  end if;
  v_order := public.require_order_access(p_order_id);
  if v_order.status <> 'open' then
    raise exception 'บิลนี้ปิดแล้ว ไม่สามารถยกเลิกส่วนลดได้';
  end if;
  update public.orders
  set discount_type = 'none', discount_value = 0, discount = 0,
      discount_reason = null, discount_applied_by = null, total = subtotal
  where id = p_order_id
  returning * into v_order;
  insert into public.audit_events (actor_id, entity_type, entity_id, action)
  values (v_user_id, 'order', p_order_id, 'discount_clear');
  return v_order;
end;
$$;

create or replace function public.checkout_order(
  p_order_id uuid,
  p_method public.payment_method,
  p_received_amount numeric,
  p_transfer_reference text default null
)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders := public.require_order_access(p_order_id);
  v_payment public.payments;
  v_receipt public.receipts;
  v_change numeric(12,2);
  v_store jsonb;
  v_table jsonb;
  v_items jsonb;
begin
  if v_order.status <> 'open' then
    raise exception 'บิลนี้ถูกปิดไปแล้ว';
  end if;
  perform public.recalculate_order_totals(p_order_id);
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.subtotal <= 0 then
    raise exception 'ไม่สามารถชำระบิลที่ไม่มีรายการอาหาร';
  end if;
  if p_method = 'cash' and p_received_amount < v_order.total then
    raise exception 'จำนวนเงินรับน้อยกว่ายอดที่ต้องชำระ';
  end if;
  if p_method = 'transfer' then
    p_received_amount := v_order.total;
  end if;
  if p_received_amount < 0 then
    raise exception 'จำนวนเงินรับไม่ถูกต้อง';
  end if;

  v_change := case when p_method = 'cash' then round(p_received_amount - v_order.total, 2) else 0 end;
  update public.orders
  set status = 'paid', closed_by = v_user_id, closed_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.payments (order_id, method, amount, received_amount, change_amount, received_by, transfer_reference)
  values (p_order_id, p_method, v_order.total, p_received_amount, v_change, v_user_id,
    nullif(btrim(coalesce(p_transfer_reference, '')), ''))
  returning * into v_payment;

  select coalesce(to_jsonb(s) - 'singleton' - 'updated_at', '{}'::jsonb) into v_store
  from public.store_settings s where s.singleton;
  select jsonb_build_object('number', t.table_number, 'name', coalesce(t.display_name, t.table_number)) into v_table
  from public.dining_tables t where t.id = v_order.table_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', oi.product_name_snapshot, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total
  ) order by oi.created_at), '[]'::jsonb) into v_items
  from public.order_items oi where oi.order_id = p_order_id;

  insert into public.receipts (order_id, mode, payload)
  values (p_order_id, v_order.receipt_mode, jsonb_build_object(
    'store', coalesce(v_store, '{}'::jsonb), 'table', coalesce(v_table, '{}'::jsonb), 'items', v_items,
    'order_number', v_order.order_number, 'opened_at', v_order.opened_at, 'closed_at', v_order.closed_at,
    'subtotal', v_order.subtotal, 'discount', v_order.discount, 'discount_type', v_order.discount_type,
    'discount_value', v_order.discount_value, 'total', v_order.total,
    'payment', jsonb_build_object('method', v_payment.method, 'received_amount', v_payment.received_amount,
      'change_amount', v_payment.change_amount, 'transfer_reference', v_payment.transfer_reference)
  )) returning * into v_receipt;

  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'order', p_order_id, 'checkout', jsonb_build_object('payment_id', v_payment.id, 'receipt_id', v_receipt.id));

  return jsonb_build_object('order', to_jsonb(v_order), 'payment', to_jsonb(v_payment), 'receipt', to_jsonb(v_receipt));
end;
$$;

create or replace function public.void_order(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
begin
  if not public.is_manager() then
    raise exception 'เฉพาะผู้จัดการเท่านั้นที่ยกเลิกบิลได้';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'ต้องระบุเหตุผลการยกเลิกบิล';
  end if;
  v_order := public.require_order_access(p_order_id);
  if v_order.status <> 'open' then
    raise exception 'ยกเลิกได้เฉพาะบิลที่ยังไม่ชำระ';
  end if;
  update public.orders
  set status = 'void', void_reason = btrim(p_reason), closed_by = v_user_id, closed_at = now()
  where id = p_order_id returning * into v_order;
  insert into public.audit_events (actor_id, entity_type, entity_id, action, reason)
  values (v_user_id, 'order', p_order_id, 'void', btrim(p_reason));
  return v_order;
end;
$$;

create or replace function public.refund_order(p_order_id uuid, p_method public.payment_method, p_reason text)
returns public.refunds
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
begin
  if not public.is_manager() then
    raise exception 'เฉพาะผู้จัดการเท่านั้นที่คืนเงินได้';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'ต้องระบุเหตุผลการคืนเงิน';
  end if;
  v_order := public.require_order_access(p_order_id);
  if v_order.status <> 'paid' then
    raise exception 'คืนเงินได้เฉพาะบิลที่ชำระแล้วและยังไม่ถูกคืน';
  end if;
  select * into v_payment from public.payments where order_id = p_order_id for update;
  insert into public.refunds (order_id, payment_id, amount, method, reason, refunded_by)
  values (p_order_id, v_payment.id, v_payment.amount, p_method, btrim(p_reason), v_user_id)
  returning * into v_refund;
  update public.orders set status = 'refunded' where id = p_order_id;
  insert into public.audit_events (actor_id, entity_type, entity_id, action, reason, metadata)
  values (v_user_id, 'order', p_order_id, 'refund', btrim(p_reason), jsonb_build_object('method', p_method, 'amount', v_payment.amount));
  return v_refund;
end;
$$;

revoke all on function public.require_active_user() from public;
revoke all on function public.require_order_access(uuid, boolean) from public;
revoke all on function public.recalculate_order_totals(uuid) from public;

grant execute on function public.create_order(uuid, public.receipt_mode) to authenticated;
grant execute on function public.list_sales_tables() to authenticated;
grant execute on function public.add_order_item(uuid, uuid, numeric) to authenticated;
grant execute on function public.set_order_item_quantity(uuid, numeric) to authenticated;
grant execute on function public.set_order_receipt_mode(uuid, public.receipt_mode) to authenticated;
grant execute on function public.apply_order_discount(uuid, public.discount_type, numeric, text) to authenticated;
grant execute on function public.clear_order_discount(uuid) to authenticated;
grant execute on function public.checkout_order(uuid, public.payment_method, numeric, text) to authenticated;
grant execute on function public.void_order(uuid, text) to authenticated;
grant execute on function public.refund_order(uuid, public.payment_method, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime' and pr.prrelid = 'public.orders'::regclass
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
