-- Phase 8.1: keep the one printed preview immutable and enforce payment checks.

drop function if exists public.checkout_order(uuid, public.payment_method, numeric, text);
create or replace function public.checkout_order(
  p_order_id uuid,
  p_method public.payment_method,
  p_received_amount numeric,
  p_transfer_reference text default null,
  p_transfer_confirmed boolean default false
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
  v_payload jsonb;
  v_had_preview boolean := false;
begin
  if v_order.status <> 'open' then raise exception 'บิลนี้ถูกปิดไปแล้ว'; end if;
  if p_method = 'transfer' and coalesce(p_transfer_confirmed, false) is not true then
    raise exception 'ต้องยืนยันว่าได้รับเงินโอนแล้ว';
  end if;
  perform public.recalculate_order_totals(p_order_id);
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.subtotal <= 0 then raise exception 'ไม่สามารถชำระบิลที่ไม่มีรายการอาหาร'; end if;
  if p_method = 'cash' and p_received_amount < v_order.total then raise exception 'จำนวนเงินรับน้อยกว่ายอดที่ต้องชำระ'; end if;
  if p_method = 'transfer' then p_received_amount := v_order.total; end if;
  if p_received_amount < 0 then raise exception 'จำนวนเงินรับไม่ถูกต้อง'; end if;
  v_change := case when p_method = 'cash' then round(p_received_amount - v_order.total, 2) else 0 end;

  update public.orders
  set status = 'paid', closed_by = v_user_id, closed_at = now(), business_at = coalesce(business_at, now())
  where id = p_order_id returning * into v_order;
  insert into public.payments (order_id, method, amount, received_amount, change_amount, received_by, transfer_reference)
  values (p_order_id, p_method, v_order.total, p_received_amount, v_change, v_user_id,
    nullif(btrim(coalesce(p_transfer_reference, '')), '')) returning * into v_payment;

  -- A preview is the only normal-process paper. Keep its payload unchanged.
  select * into v_receipt
  from public.receipts
  where order_id = p_order_id and is_preview and not payment_confirmed
  order by print_number desc
  limit 1
  for update;
  if found then
    v_had_preview := true;
    update public.receipts
    set payment_confirmed = true
    where id = v_receipt.id
    returning * into v_receipt;
  else
    -- Defensive fallback for non-POS callers; this receipt is not queued automatically.
    select coalesce(to_jsonb(s) - 'singleton' - 'updated_at', '{}'::jsonb) into v_store from public.store_settings s where s.singleton;
    select jsonb_build_object('number', t.table_number, 'name', coalesce(t.display_name, t.table_number)) into v_table from public.dining_tables t where t.id = v_order.table_id;
    select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name_snapshot, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total) order by oi.created_at), '[]'::jsonb)
      into v_items from public.order_items oi where oi.order_id = p_order_id;
    v_payload := jsonb_build_object(
      'store', coalesce(v_store, '{}'::jsonb), 'table', coalesce(v_table, '{}'::jsonb), 'items', v_items,
      'order_number', v_order.order_number, 'opened_at', v_order.opened_at, 'closed_at', v_order.closed_at, 'business_at', v_order.business_at,
      'subtotal', v_order.subtotal, 'discount', v_order.discount, 'discount_type', v_order.discount_type,
      'discount_value', v_order.discount_value, 'total', v_order.total,
      'payment', jsonb_build_object('method', v_payment.method, 'received_amount', v_payment.received_amount,
        'change_amount', v_payment.change_amount, 'transfer_reference', v_payment.transfer_reference),
      'preview', false
    );
    insert into public.receipts (order_id, mode, payload, bill_revision, is_preview, payment_confirmed)
    values (p_order_id, v_order.receipt_mode, v_payload, coalesce(v_order.revision_no, 0), false, true)
    returning * into v_receipt;
  end if;

  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'order', p_order_id, 'checkout', jsonb_build_object(
    'payment_id', v_payment.id, 'receipt_id', v_receipt.id,
    'preview_kept', v_had_preview, 'preview_only_print_flow', v_had_preview
  ));
  return jsonb_build_object('order', to_jsonb(v_order), 'payment', to_jsonb(v_payment), 'receipt', to_jsonb(v_receipt));
end;
$$;

create or replace function public.cancel_order_receipt_preview(p_receipt_id uuid)
returns public.receipts
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_receipt public.receipts;
begin
  select r.* into v_receipt
  from public.receipts r
  join public.orders o on o.id = r.order_id
  where r.id = p_receipt_id and r.is_preview and not r.payment_confirmed
  for update of r;
  if not found then raise exception 'ไม่พบ Preview ที่ยกเลิกได้'; end if;
  if not public.is_manager() and not exists (
    select 1 from public.orders where id = v_receipt.order_id and opened_by = v_user_id
  ) then
    raise exception 'คุณไม่มีสิทธิ์ยกเลิก Preview นี้';
  end if;

  if v_receipt.print_status in ('pending', 'failed', 'review_required') then
    update public.receipts
    set print_status = 'cancelled', print_requested_at = null, print_requested_by = null,
      lease_expires_at = null, claim_token = null, print_claimed_at = null,
      print_claimed_by = null, last_error = 'ยกเลิก Preview ก่อนชำระเงิน'
    where id = p_receipt_id returning * into v_receipt;
  end if;
  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'receipt', p_receipt_id, 'preview_cancel', jsonb_build_object('order_id', v_receipt.order_id));
  return v_receipt;
end;
$$;

revoke all on function public.checkout_order(uuid, public.payment_method, numeric, text, boolean) from public;
revoke all on function public.cancel_order_receipt_preview(uuid) from public;
grant execute on function public.checkout_order(uuid, public.payment_method, numeric, text, boolean) to authenticated;
grant execute on function public.cancel_order_receipt_preview(uuid) to authenticated;

drop function if exists public.finalize_order_correction(uuid, public.payment_method, public.payment_method, numeric, text, text);
create or replace function public.finalize_order_correction(
  p_correction_id uuid,
  p_refund_method public.payment_method,
  p_new_payment_method public.payment_method,
  p_new_received_amount numeric,
  p_new_transfer_reference text default null,
  p_refund_transfer_reference text default null,
  p_new_transfer_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_correction public.order_corrections;
  v_source public.orders;
  v_source_payment public.payments;
  v_new_order public.orders;
  v_new_payment public.payments;
  v_refund public.refunds;
  v_receipt public.receipts;
  v_store jsonb;
  v_table jsonb;
  v_items jsonb;
  v_change numeric(12,2);
  v_result jsonb;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่ยืนยันการแก้ไขบิลได้'; end if;
  if p_new_payment_method = 'transfer' and coalesce(p_new_transfer_confirmed, false) is not true then
    raise exception 'ต้องยืนยันว่าได้รับเงินโอนบิลใหม่แล้ว';
  end if;
  select * into v_correction from public.order_corrections where id = p_correction_id for update;
  if not found then raise exception 'ไม่พบ Draft แก้ไขบิล'; end if;
  if v_correction.status = 'finalized' then return coalesce(v_correction.finalize_result, '{}'::jsonb); end if;
  if v_correction.status <> 'draft' then raise exception 'Draft นี้ถูกยกเลิกแล้ว'; end if;

  select * into v_source from public.orders where id = v_correction.source_order_id for update;
  if v_source.status <> 'paid' or v_source.superseded_by_order_id is not null then raise exception 'บิลต้นฉบับไม่อยู่ในสถานะที่แก้ไขได้'; end if;
  if exists (select 1 from public.receipts where order_id = v_source.id and print_status = 'printing') then
    raise exception 'กรุณาตรวจสอบงานพิมพ์เดิมที่กำลังดำเนินการก่อนแก้ไขบิล';
  end if;
  v_correction := public.recalculate_order_correction(p_correction_id);
  if v_correction.total <= 0 or not exists (select 1 from public.order_correction_items where correction_id = p_correction_id) then
    raise exception 'บิลใหม่ต้องมีรายการอาหารและยอดมากกว่า 0';
  end if;

  select * into v_source_payment from public.payments where order_id = v_source.id for update;
  if not found then raise exception 'ไม่พบข้อมูลการชำระเงินของบิลต้นฉบับ'; end if;
  if p_new_payment_method = 'cash' and p_new_received_amount < v_correction.total then raise exception 'จำนวนเงินรับน้อยกว่ายอดบิลใหม่'; end if;
  if p_new_payment_method = 'transfer' then p_new_received_amount := v_correction.total; end if;
  if p_new_received_amount < 0 then raise exception 'จำนวนเงินรับไม่ถูกต้อง'; end if;
  v_change := case when p_new_payment_method = 'cash' then round(p_new_received_amount - v_correction.total, 2) else 0 end;

  insert into public.orders (
    table_id, receipt_mode, status, subtotal, discount_type, discount_value, discount, discount_reason,
    discount_applied_by, total, opened_by, closed_by, opened_at, closed_at, business_at,
    root_order_id, revision_no, correction_id
  ) values (
    v_correction.table_id, v_correction.receipt_mode, 'paid', v_correction.subtotal, v_correction.discount_type,
    v_correction.discount_value, v_correction.discount, v_correction.discount_reason,
    case when v_correction.discount_type = 'none' then null else v_user_id end,
    v_correction.total, v_source.opened_by, v_user_id, now(), now(), v_correction.business_at,
    v_correction.root_order_id, v_correction.revision_no, v_correction.id
  ) returning * into v_new_order;

  insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price, quantity, line_total)
  select v_new_order.id, product_id, product_name_snapshot, unit_price, quantity, line_total
  from public.order_correction_items where correction_id = p_correction_id order by created_at;

  insert into public.payments (order_id, method, amount, received_amount, change_amount, received_by, transfer_reference)
  values (v_new_order.id, p_new_payment_method, v_new_order.total, p_new_received_amount, v_change, v_user_id,
    nullif(btrim(coalesce(p_new_transfer_reference, '')), '')) returning * into v_new_payment;

  select coalesce(to_jsonb(s) - 'singleton' - 'updated_at', '{}'::jsonb) into v_store from public.store_settings s where s.singleton;
  select jsonb_build_object('number', t.table_number, 'name', coalesce(t.display_name, t.table_number)) into v_table from public.dining_tables t where t.id = v_new_order.table_id;
  select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name_snapshot, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total) order by oi.created_at), '[]'::jsonb)
    into v_items from public.order_items oi where oi.order_id = v_new_order.id;

  insert into public.receipts (order_id, mode, payload, bill_revision, supersedes_receipt_id)
  values (v_new_order.id, v_new_order.receipt_mode, jsonb_build_object(
    'store', coalesce(v_store, '{}'::jsonb), 'table', coalesce(v_table, '{}'::jsonb), 'items', v_items,
    'order_number', v_source.order_number, 'display_order_number', v_source.order_number::text || '-R' || v_correction.revision_no,
    'revision_no', v_correction.revision_no, 'opened_at', v_new_order.opened_at, 'closed_at', v_new_order.closed_at,
    'business_at', v_new_order.business_at, 'subtotal', v_new_order.subtotal, 'discount', v_new_order.discount,
    'discount_type', v_new_order.discount_type, 'discount_value', v_new_order.discount_value, 'total', v_new_order.total,
    'payment', jsonb_build_object('method', v_new_payment.method, 'received_amount', v_new_payment.received_amount,
      'change_amount', v_new_payment.change_amount, 'transfer_reference', v_new_payment.transfer_reference),
    'correction', jsonb_build_object('source_order_id', v_source.id, 'source_order_number', v_source.order_number,
      'source_total', v_source.total, 'refund_method', p_refund_method)
  ), v_correction.revision_no, (select r.id from public.receipts r where r.order_id = v_source.id order by r.print_number desc limit 1)
  ) returning * into v_receipt;

  insert into public.refunds (order_id, payment_id, amount, method, reason, refunded_by, kind, transfer_reference)
  values (v_source.id, v_source_payment.id, v_source_payment.amount, p_refund_method,
    'แก้ไขบิล ' || v_source.order_number, v_user_id, 'correction_reversal',
    nullif(btrim(coalesce(p_refund_transfer_reference, '')), '')) returning * into v_refund;

  update public.orders set status = 'refunded', superseded_by_order_id = v_new_order.id where id = v_source.id;
  update public.receipts
  set is_superseded = true,
      print_status = case when print_status in ('pending', 'failed', 'review_required') then 'cancelled' else print_status end,
      last_error = case when print_status in ('pending', 'failed', 'review_required') then 'ถูกแทนที่ด้วยใบเสร็จแก้ไข' else last_error end
  where order_id = v_source.id;
  update public.order_corrections
  set status = 'finalized', replacement_order_id = v_new_order.id, finalized_by = v_user_id, finalized_at = now()
  where id = p_correction_id;
  select * into v_correction from public.order_corrections where id = p_correction_id;

  v_result := jsonb_build_object(
    'correction', to_jsonb(v_correction), 'source_order', to_jsonb(v_source), 'replacement_order', to_jsonb(v_new_order),
    'payment', to_jsonb(v_new_payment), 'refund', to_jsonb(v_refund), 'receipt', to_jsonb(v_receipt)
  );
  update public.order_corrections set finalize_result = v_result where id = p_correction_id;
  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'order', v_new_order.id, 'correction_finalize', jsonb_build_object(
    'correction_id', p_correction_id, 'source_order_id', v_source.id, 'refund_id', v_refund.id,
    'payment_id', v_new_payment.id, 'receipt_id', v_receipt.id
  ));
  return v_result;
end;
$$;

revoke all on function public.finalize_order_correction(uuid, public.payment_method, public.payment_method, numeric, text, text, boolean) from public;
grant execute on function public.finalize_order_correction(uuid, public.payment_method, public.payment_method, numeric, text, text, boolean) to authenticated;
