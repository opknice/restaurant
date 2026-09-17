-- Phase 8: preview and print a bill before accepting payment.
-- Preview receipts are linked to the open order and remain the printed artifact
-- after checkout. Cancelling the UI step never removes the order.

alter table public.receipts
  add column if not exists is_preview boolean not null default false,
  add column if not exists payment_confirmed boolean not null default true;

create or replace function public.get_order_receipt_preview(
  p_order_id uuid, p_receipt_mode public.receipt_mode default 'shop'
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.orders := public.require_order_access(p_order_id);
  v_store jsonb;
  v_table jsonb;
  v_items jsonb;
begin
  if v_order.status <> 'open' then raise exception 'แสดง Preview ได้เฉพาะบิลที่ยังไม่ชำระ'; end if;
  perform public.recalculate_order_totals(p_order_id);
  select * into v_order from public.orders where id = p_order_id;
  select coalesce(to_jsonb(s) - 'singleton' - 'updated_at', '{}'::jsonb) into v_store from public.store_settings s where s.singleton;
  select jsonb_build_object('number', t.table_number, 'name', coalesce(t.display_name, t.table_number)) into v_table from public.dining_tables t where t.id = v_order.table_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', oi.product_name_snapshot, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total
  ) order by oi.created_at), '[]'::jsonb) into v_items from public.order_items oi where oi.order_id = p_order_id;
  return jsonb_build_object(
    'mode', p_receipt_mode, 'order_number', v_order.order_number, 'opened_at', v_order.opened_at,
    'table', coalesce(v_table, '{}'::jsonb), 'store', coalesce(v_store, '{}'::jsonb), 'items', v_items,
    'subtotal', v_order.subtotal, 'discount', v_order.discount, 'total', v_order.total,
    'payment', null, 'preview', true
  );
end;
$$;

create or replace function public.prepare_order_receipt(
  p_order_id uuid, p_receipt_mode public.receipt_mode
)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders := public.require_order_access(p_order_id);
  v_receipt public.receipts;
  v_payload jsonb;
begin
  if v_order.status <> 'open' then raise exception 'เตรียมพิมพ์ได้เฉพาะบิลที่ยังไม่ชำระ'; end if;
  v_payload := public.get_order_receipt_preview(p_order_id, p_receipt_mode);
  update public.orders set receipt_mode = p_receipt_mode where id = p_order_id;
  select * into v_receipt from public.receipts where order_id = p_order_id and is_preview and not payment_confirmed order by print_number desc limit 1 for update;
  if found then
    update public.receipts set mode = p_receipt_mode, payload = v_payload, is_preview = true, payment_confirmed = false,
      is_superseded = false, print_status = case when print_status = 'printing' then print_status else 'pending' end,
      print_requested_at = null, print_requested_by = null, print_claimed_at = null, print_claimed_by = null, last_error = null
    where id = v_receipt.id returning * into v_receipt;
  else
    insert into public.receipts (order_id, mode, payload, is_preview, payment_confirmed, bill_revision)
    values (p_order_id, p_receipt_mode, v_payload, true, false, coalesce(v_order.revision_no, 0)) returning * into v_receipt;
  end if;
  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'receipt', v_receipt.id, 'preview_prepare', jsonb_build_object('order_id', p_order_id, 'mode', p_receipt_mode));
  return v_receipt;
end;
$$;

-- Rebuild checkout so a prepared preview receipt is finalized in place.
create or replace function public.checkout_order(
  p_order_id uuid, p_method public.payment_method, p_received_amount numeric, p_transfer_reference text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
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
  v_payload jsonb;
  v_had_preview boolean := false;
begin
  if v_order.status <> 'open' then raise exception 'บิลนี้ถูกปิดไปแล้ว'; end if;
  perform public.recalculate_order_totals(p_order_id);
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.subtotal <= 0 then raise exception 'ไม่สามารถชำระบิลที่ไม่มีรายการอาหาร'; end if;
  if p_method = 'cash' and p_received_amount < v_order.total then raise exception 'จำนวนเงินรับน้อยกว่ายอดที่ต้องชำระ'; end if;
  if p_method = 'transfer' then p_received_amount := v_order.total; end if;
  if p_received_amount < 0 then raise exception 'จำนวนเงินรับไม่ถูกต้อง'; end if;
  v_change := case when p_method = 'cash' then round(p_received_amount - v_order.total, 2) else 0 end;

  update public.orders set status = 'paid', closed_by = v_user_id, closed_at = now(), business_at = coalesce(business_at, now())
  where id = p_order_id returning * into v_order;
  insert into public.payments (order_id, method, amount, received_amount, change_amount, received_by, transfer_reference)
  values (p_order_id, p_method, v_order.total, p_received_amount, v_change, v_user_id, nullif(btrim(coalesce(p_transfer_reference, '')), ''))
  returning * into v_payment;

  select coalesce(to_jsonb(s) - 'singleton' - 'updated_at', '{}'::jsonb) into v_store from public.store_settings s where s.singleton;
  select jsonb_build_object('number', t.table_number, 'name', coalesce(t.display_name, t.table_number)) into v_table from public.dining_tables t where t.id = v_order.table_id;
  select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name_snapshot, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total) order by oi.created_at), '[]'::jsonb)
    into v_items from public.order_items oi where oi.order_id = p_order_id;
  v_payload := jsonb_build_object(
    'store', coalesce(v_store, '{}'::jsonb), 'table', coalesce(v_table, '{}'::jsonb), 'items', v_items,
    'order_number', v_order.order_number, 'opened_at', v_order.opened_at, 'closed_at', v_order.closed_at, 'business_at', v_order.business_at,
    'subtotal', v_order.subtotal, 'discount', v_order.discount, 'discount_type', v_order.discount_type, 'discount_value', v_order.discount_value, 'total', v_order.total,
    'payment', jsonb_build_object('method', v_payment.method, 'received_amount', v_payment.received_amount, 'change_amount', v_payment.change_amount, 'transfer_reference', v_payment.transfer_reference),
    'preview', false
  );

  select * into v_receipt from public.receipts where order_id = p_order_id and is_preview and not payment_confirmed order by print_number desc limit 1 for update;
  if found then
    v_had_preview := true;
    update public.receipts set mode = v_order.receipt_mode, payload = v_payload, is_preview = false, payment_confirmed = true where id = v_receipt.id returning * into v_receipt;
  else
    insert into public.receipts (order_id, mode, payload, bill_revision, is_preview, payment_confirmed)
    values (p_order_id, v_order.receipt_mode, v_payload, coalesce(v_order.revision_no, 0), false, true) returning * into v_receipt;
  end if;

  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'order', p_order_id, 'checkout', jsonb_build_object('payment_id', v_payment.id, 'receipt_id', v_receipt.id, 'preview_prepared_first', v_had_preview));
  return jsonb_build_object('order', to_jsonb(v_order), 'payment', to_jsonb(v_payment), 'receipt', to_jsonb(v_receipt));
end;
$$;

revoke all on function public.get_order_receipt_preview(uuid, public.receipt_mode) from public;
revoke all on function public.prepare_order_receipt(uuid, public.receipt_mode) from public;
revoke all on function public.checkout_order(uuid, public.payment_method, numeric, text) from public;
grant execute on function public.get_order_receipt_preview(uuid, public.receipt_mode) to authenticated;
grant execute on function public.prepare_order_receipt(uuid, public.receipt_mode) to authenticated;
grant execute on function public.checkout_order(uuid, public.payment_method, numeric, text) to authenticated;
