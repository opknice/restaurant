-- Phase 10: harden RPC privileges and make preview-first checkout consistent.

-- Supabase grants function execution through default privileges. Remove those
-- broad grants first, then explicitly allow only the public application API.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from service_role;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;

alter table public.receipts add column if not exists client_request_id uuid;
alter table public.orders add column if not exists checkout_request_id uuid;

alter table public.store_settings drop constraint if exists store_settings_payment_qr_https;
alter table public.store_settings add constraint store_settings_payment_qr_https
  check (payment_qr_path is null or btrim(payment_qr_path) = '' or payment_qr_path ~* '^https://');

create unique index if not exists receipts_client_request_idx
  on public.receipts(client_request_id) where client_request_id is not null;
create unique index if not exists orders_checkout_request_idx
  on public.orders(checkout_request_id) where checkout_request_id is not null;

create or replace function public.is_order_checkout_locked(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.receipts r
    where r.order_id = p_order_id
      and r.is_preview
      and not r.payment_confirmed
      and r.print_requested_at is not null
      and r.print_status <> 'cancelled'
  );
$$;

create or replace function public.protect_locked_order_items()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
begin
  if public.is_order_checkout_locked(v_order_id) then
    raise exception 'บิลส่งพิมพ์แล้ว ไม่สามารถแก้รายการอาหารได้ กรุณาชำระเงินให้เสร็จสิ้น';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_locked_order_items_trigger on public.order_items;
create trigger protect_locked_order_items_trigger
before insert or update or delete on public.order_items
for each row execute function public.protect_locked_order_items();

create or replace function public.protect_locked_order_totals()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if old.status = 'open'
    and public.is_order_checkout_locked(old.id)
    and (
      new.receipt_mode is distinct from old.receipt_mode
      or new.subtotal is distinct from old.subtotal
      or new.discount_type is distinct from old.discount_type
      or new.discount_value is distinct from old.discount_value
      or new.discount is distinct from old.discount
      or new.total is distinct from old.total
    ) then
    raise exception 'บิลส่งพิมพ์แล้ว ไม่สามารถแก้ยอดหรือรูปแบบใบเสร็จได้ กรุณาชำระเงินให้เสร็จสิ้น';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_locked_order_totals_trigger on public.orders;
create trigger protect_locked_order_totals_trigger
before update on public.orders
for each row execute function public.protect_locked_order_totals();

create or replace function public.recalculate_order_totals(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.orders := public.require_order_access(p_order_id);
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
begin
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
  set subtotal = v_subtotal, discount = v_discount, total = v_subtotal - v_discount
  where id = p_order_id
  returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.prepare_and_request_order_receipt(
  p_order_id uuid,
  p_receipt_mode public.receipt_mode,
  p_client_request_id uuid
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
  if p_client_request_id is null then raise exception 'ไม่พบรหัสคำขอพิมพ์'; end if;
  if v_order.status <> 'open' then raise exception 'เตรียมพิมพ์ได้เฉพาะบิลที่ยังไม่ชำระ'; end if;

  select * into v_receipt
  from public.receipts
  where order_id = p_order_id and is_preview and not payment_confirmed
  order by print_number desc limit 1
  for update;

  -- A retry or page reload resumes payment without producing another paper.
  if found and v_receipt.print_requested_at is not null and v_receipt.print_status <> 'cancelled' then
    if v_receipt.mode <> p_receipt_mode then
      raise exception 'บิลนี้ส่งพิมพ์แล้วด้วยรูปแบบอื่น ไม่สามารถเปลี่ยนรูปแบบได้';
    end if;
    return v_receipt;
  end if;

  v_payload := public.get_order_receipt_preview(p_order_id, p_receipt_mode);
  update public.orders set receipt_mode = p_receipt_mode where id = p_order_id;

  if found then
    update public.receipts
    set mode = p_receipt_mode, payload = v_payload, is_preview = true,
        payment_confirmed = false, is_superseded = false,
        print_status = 'pending', print_attempts = 0,
        print_requested_at = now(), print_requested_by = v_user_id,
        print_claimed_at = null, print_claimed_by = null,
        lease_expires_at = null, claim_token = null, last_error = null,
        client_request_id = p_client_request_id
    where id = v_receipt.id
    returning * into v_receipt;
  else
    insert into public.receipts (
      order_id, mode, payload, is_preview, payment_confirmed, bill_revision,
      print_status, print_requested_at, print_requested_by, client_request_id
    ) values (
      p_order_id, p_receipt_mode, v_payload, true, false,
      coalesce(v_order.revision_no, 0), 'pending', now(), v_user_id,
      p_client_request_id
    ) returning * into v_receipt;
  end if;

  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'receipt', v_receipt.id, 'preview_print_request',
    jsonb_build_object('order_id', p_order_id, 'mode', p_receipt_mode,
      'client_request_id', p_client_request_id));
  return v_receipt;
end;
$$;

create or replace function public.request_receipt_print(p_receipt_id uuid)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_receipt public.receipts;
begin
  select r.* into v_receipt
  from public.receipts r join public.orders o on o.id = r.order_id
  where r.id = p_receipt_id
  for update of r;
  if not found then raise exception 'ไม่พบใบเสร็จ'; end if;
  if v_receipt.is_superseded then raise exception 'ใบเสร็จนี้ถูกแทนที่ด้วย Revision ใหม่แล้ว'; end if;
  if not public.is_manager() and not exists (
    select 1 from public.orders where id = v_receipt.order_id and opened_by = v_user_id
  ) then raise exception 'คุณไม่มีสิทธิ์พิมพ์ใบเสร็จนี้'; end if;
  if v_receipt.print_requested_at is not null or v_receipt.print_status in ('printing', 'printed') then
    raise exception 'ใบเสร็จนี้ถูกส่งพิมพ์แล้ว';
  end if;
  if v_receipt.print_attempts >= 3 then raise exception 'งานพิมพ์เกินจำนวนครั้งที่กำหนด กรุณาให้ผู้จัดการตรวจสอบ'; end if;

  update public.receipts
  set print_status = 'pending', print_requested_at = now(), print_requested_by = v_user_id,
      print_claimed_at = null, print_claimed_by = null, lease_expires_at = null,
      claim_token = null, last_error = null
  where id = p_receipt_id returning * into v_receipt;
  insert into public.audit_events(actor_id, entity_type, entity_id, action)
  values (v_user_id, 'receipt', p_receipt_id, 'print_request');
  return v_receipt;
end;
$$;

create or replace function public.request_receipt_reprint(p_receipt_id uuid)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_source public.receipts;
  v_receipt public.receipts;
  v_print_number integer;
begin
  select r.* into v_source
  from public.receipts r join public.orders o on o.id = r.order_id
  where r.id = p_receipt_id
  for update of r;
  if not found then raise exception 'ไม่พบใบเสร็จ'; end if;
  if not v_source.payment_confirmed then raise exception 'พิมพ์ซ้ำได้เฉพาะบิลที่ชำระเงินแล้ว'; end if;
  if v_source.is_superseded then raise exception 'ใบเสร็จนี้ถูกแทนที่ด้วย Revision ใหม่แล้ว'; end if;
  if not public.is_manager() and not exists (
    select 1 from public.orders where id = v_source.order_id and opened_by = v_user_id
  ) then raise exception 'คุณไม่มีสิทธิ์พิมพ์ใบเสร็จนี้'; end if;

  select coalesce(max(print_number), 0) + 1 into v_print_number
  from public.receipts where order_id = v_source.order_id;
  insert into public.receipts (
    order_id, print_number, mode, payload, print_status,
    print_requested_at, print_requested_by, bill_revision,
    is_preview, payment_confirmed, supersedes_receipt_id
  ) values (
    v_source.order_id, v_print_number, v_source.mode, v_source.payload, 'pending',
    now(), v_user_id, v_source.bill_revision,
    false, true, v_source.id
  ) returning * into v_receipt;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'receipt', v_receipt.id, 'receipt_reprint_request',
    jsonb_build_object('source_receipt_id', v_source.id, 'print_number', v_print_number));
  return v_receipt;
end;
$$;

drop function if exists public.checkout_order(uuid, public.payment_method, numeric, text, boolean);
create or replace function public.checkout_order(
  p_order_id uuid,
  p_method public.payment_method,
  p_received_amount numeric,
  p_transfer_reference text default null,
  p_transfer_confirmed boolean default false,
  p_client_request_id uuid default null
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
  v_current_preview jsonb;
begin
  if p_client_request_id is null then raise exception 'ไม่พบรหัสคำขอชำระเงิน'; end if;

  if v_order.status = 'paid' and v_order.checkout_request_id = p_client_request_id then
    select * into v_payment from public.payments where order_id = p_order_id;
    select * into v_receipt from public.receipts
      where order_id = p_order_id and payment_confirmed
      order by print_number desc limit 1;
    if v_payment.method <> p_method then raise exception 'รหัสคำขอเดิมมีวิธีชำระเงินไม่ตรงกัน'; end if;
    return jsonb_build_object('order', to_jsonb(v_order), 'payment', to_jsonb(v_payment), 'receipt', to_jsonb(v_receipt));
  end if;
  if v_order.status <> 'open' then raise exception 'บิลนี้ถูกปิดไปแล้ว'; end if;
  if p_method = 'transfer' and coalesce(p_transfer_confirmed, false) is not true then
    raise exception 'ต้องยืนยันว่าได้รับเงินโอนแล้ว';
  end if;

  select * into v_receipt
  from public.receipts
  where order_id = p_order_id and is_preview and not payment_confirmed
    and print_requested_at is not null and print_status <> 'cancelled'
  order by print_number desc limit 1
  for update;
  if not found then raise exception 'กรุณาพิมพ์ Preview ก่อนยืนยันชำระเงิน'; end if;

  v_current_preview := public.get_order_receipt_preview(p_order_id, v_receipt.mode);
  if v_receipt.payload -> 'items' is distinct from v_current_preview -> 'items'
    or v_receipt.payload -> 'subtotal' is distinct from v_current_preview -> 'subtotal'
    or v_receipt.payload -> 'discount' is distinct from v_current_preview -> 'discount'
    or v_receipt.payload -> 'total' is distinct from v_current_preview -> 'total' then
    raise exception 'รายการหรือยอดบิลเปลี่ยนหลังพิมพ์ Preview กรุณาให้ผู้จัดการตรวจสอบ';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.subtotal <= 0 then raise exception 'ไม่สามารถชำระบิลที่ไม่มีรายการอาหาร'; end if;
  if p_received_amount is null then raise exception 'ต้องระบุจำนวนเงินรับ'; end if;
  if p_method = 'cash' and p_received_amount < v_order.total then raise exception 'จำนวนเงินรับน้อยกว่ายอดที่ต้องชำระ'; end if;
  if p_method = 'transfer' then p_received_amount := v_order.total; end if;
  if p_received_amount < 0 then raise exception 'จำนวนเงินรับไม่ถูกต้อง'; end if;
  v_change := case when p_method = 'cash' then round(p_received_amount - v_order.total, 2) else 0 end;

  update public.orders
  set status = 'paid', closed_by = v_user_id, closed_at = now(),
      business_at = coalesce(business_at, now()), checkout_request_id = p_client_request_id
  where id = p_order_id returning * into v_order;
  insert into public.payments(order_id, method, amount, received_amount, change_amount, received_by, transfer_reference)
  values (p_order_id, p_method, v_order.total, p_received_amount, v_change, v_user_id,
    nullif(btrim(coalesce(p_transfer_reference, '')), ''))
  returning * into v_payment;
  update public.receipts set payment_confirmed = true where id = v_receipt.id returning * into v_receipt;

  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'order', p_order_id, 'checkout', jsonb_build_object(
    'payment_id', v_payment.id, 'receipt_id', v_receipt.id,
    'client_request_id', p_client_request_id, 'preview_kept', true
  ));
  return jsonb_build_object('order', to_jsonb(v_order), 'payment', to_jsonb(v_payment), 'receipt', to_jsonb(v_receipt));
end;
$$;

create or replace function public.list_daily_wages(p_date date)
returns table (
  employee_id uuid, employee_name text, daily_wage numeric,
  employee_active boolean, expense_id uuid, selected boolean,
  status public.expense_status
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_date is null then raise exception 'ต้องระบุวันที่'; end if;
  return query
  select e.id,
    coalesce(x.employee_name_snapshot, e.name),
    coalesce(x.daily_wage_snapshot, e.daily_wage),
    e.active, x.id, coalesce(x.status = 'active', false), x.status
  from public.employees e
  left join lateral (
    select w.id, w.status, w.employee_name_snapshot, w.daily_wage_snapshot
    from public.expenses w
    where w.kind = 'wage' and w.employee_id = e.id and w.expense_date = p_date
    order by (w.status = 'active') desc, w.created_at desc
    limit 1
  ) x on true
  order by e.active desc, coalesce(x.employee_name_snapshot, e.name);
end;
$$;

create or replace function public.list_print_queue()
returns setof public.receipts
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  return query
  select * from public.receipts
  where (print_status = 'pending' and print_requested_at is not null)
     or print_status in ('printing', 'failed', 'review_required')
  order by created_at desc;
end;
$$;

update public.receipts
set print_status = 'cancelled', last_error = 'รายการเก่าที่ไม่เคยส่งเข้าคิวพิมพ์'
where print_status = 'pending' and print_requested_at is null and payment_confirmed;

-- RLS helpers must remain executable because policies invoke them.
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_manager() to authenticated;

grant execute on function public.create_order(uuid, public.receipt_mode) to authenticated;
grant execute on function public.list_sales_tables() to authenticated;
grant execute on function public.add_order_item(uuid, uuid, numeric) to authenticated;
grant execute on function public.set_order_item_quantity(uuid, numeric) to authenticated;
grant execute on function public.set_order_receipt_mode(uuid, public.receipt_mode) to authenticated;
grant execute on function public.apply_order_discount(uuid, public.discount_type, numeric, text) to authenticated;
grant execute on function public.clear_order_discount(uuid) to authenticated;
grant execute on function public.get_order_receipt_preview(uuid, public.receipt_mode) to authenticated;
grant execute on function public.prepare_and_request_order_receipt(uuid, public.receipt_mode, uuid) to authenticated;
grant execute on function public.request_receipt_print(uuid) to authenticated;
grant execute on function public.request_receipt_reprint(uuid) to authenticated;
grant execute on function public.cancel_order_receipt_preview(uuid) to authenticated;
grant execute on function public.checkout_order(uuid, public.payment_method, numeric, text, boolean, uuid) to authenticated;
grant execute on function public.void_order(uuid, text) to authenticated;
grant execute on function public.refund_order(uuid, public.payment_method, text) to authenticated;
grant execute on function public.get_sales_report(timestamptz, timestamptz) to authenticated;
grant execute on function public.list_sales_history(timestamptz, timestamptz, bigint) to authenticated;
grant execute on function public.list_sales_history_page(timestamptz, timestamptz, bigint, timestamptz, uuid, integer) to authenticated;

grant execute on function public.start_order_correction(uuid, text, uuid) to authenticated;
grant execute on function public.add_order_correction_item(uuid, uuid, numeric) to authenticated;
grant execute on function public.set_order_correction_item_quantity(uuid, numeric) to authenticated;
grant execute on function public.set_order_correction_receipt_mode(uuid, public.receipt_mode) to authenticated;
grant execute on function public.apply_order_correction_discount(uuid, public.discount_type, numeric, text) to authenticated;
grant execute on function public.clear_order_correction_discount(uuid) to authenticated;
grant execute on function public.cancel_order_correction(uuid) to authenticated;
grant execute on function public.finalize_order_correction(uuid, public.payment_method, public.payment_method, numeric, text, text, boolean) to authenticated;

grant execute on function public.list_employees() to authenticated;
grant execute on function public.save_employee(uuid, text, numeric) to authenticated;
grant execute on function public.set_employee_active(uuid, boolean) to authenticated;
grant execute on function public.list_daily_wages(date) to authenticated;
grant execute on function public.save_expense_and_daily_wages(date, numeric, text, uuid[], uuid) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.list_expenses_page(date, date, date, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_expense_total(date, date) to authenticated;
grant execute on function public.get_financial_report(timestamptz, timestamptz) to authenticated;

grant execute on function public.list_print_queue() to authenticated;
grant execute on function public.manager_requeue_receipt(uuid) to authenticated;
grant execute on function public.manager_mark_receipt_printed(uuid) to authenticated;
grant execute on function public.manager_cancel_receipt(uuid) to authenticated;
grant execute on function public.bridge_claim_next_receipt(text) to service_role;
grant execute on function public.bridge_complete_receipt_print(uuid, uuid, boolean, text, boolean) to service_role;
