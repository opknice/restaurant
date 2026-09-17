-- Phase 7: manager-only correction workflow for already-paid orders.
-- A paid order stays immutable while its correction is drafted. Finalization
-- reverses the original payment and creates a linked replacement revision in
-- one transaction, preserving the original business/reporting date.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'correction_status' and typnamespace = 'public'::regnamespace) then
    create type public.correction_status as enum ('draft', 'finalized', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'refund_kind' and typnamespace = 'public'::regnamespace) then
    create type public.refund_kind as enum ('customer_refund', 'correction_reversal');
  end if;
end;
$$;

alter table public.orders
  add column if not exists business_at timestamptz,
  add column if not exists root_order_id uuid references public.orders(id),
  add column if not exists revision_no integer not null default 0,
  add column if not exists superseded_by_order_id uuid references public.orders(id),
  add column if not exists correction_id uuid;

update public.orders
set business_at = coalesce(business_at, closed_at),
    root_order_id = coalesce(root_order_id, id)
where business_at is null or root_order_id is null;

alter table public.orders
  add constraint orders_revision_no_check check (revision_no >= 0);

alter table public.refunds
  add column if not exists kind public.refund_kind not null default 'customer_refund',
  add column if not exists transfer_reference text;

create table if not exists public.order_corrections (
  id uuid primary key default gen_random_uuid(),
  source_order_id uuid not null references public.orders(id),
  root_order_id uuid not null references public.orders(id),
  replacement_order_id uuid references public.orders(id),
  revision_no integer not null check (revision_no > 0),
  status public.correction_status not null default 'draft',
  reason text not null check (length(btrim(reason)) > 0),
  table_id uuid references public.dining_tables(id),
  receipt_mode public.receipt_mode not null,
  discount_type public.discount_type not null default 'none',
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  discount_reason text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  business_at timestamptz not null,
  client_request_id uuid not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  finalized_by uuid references public.profiles(id),
  finalized_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  finalize_result jsonb,
  check ((status = 'draft' and finalized_at is null and cancelled_at is null)
      or (status = 'finalized' and finalized_at is not null and replacement_order_id is not null)
      or (status = 'cancelled' and cancelled_at is not null))
);

create unique index if not exists order_corrections_one_draft_per_source_idx
  on public.order_corrections(source_order_id) where status = 'draft';
create index if not exists order_corrections_root_idx
  on public.order_corrections(root_order_id, revision_no desc);

create table if not exists public.order_correction_items (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references public.order_corrections(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity numeric(12,3) not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists order_correction_items_one_product_idx
  on public.order_correction_items(correction_id, product_id) where product_id is not null;
create index if not exists order_correction_items_correction_idx
  on public.order_correction_items(correction_id, created_at);

alter table public.receipts
  add column if not exists supersedes_receipt_id uuid references public.receipts(id),
  add column if not exists bill_revision integer not null default 0,
  add column if not exists is_superseded boolean not null default false;

create index if not exists orders_business_cursor_idx
  on public.orders(business_at desc, id desc);
create index if not exists receipts_superseded_idx
  on public.receipts(order_id, is_superseded, print_number desc);

alter table public.order_corrections enable row level security;
alter table public.order_correction_items enable row level security;

revoke all on table public.order_corrections, public.order_correction_items from anon, authenticated;
grant select on public.order_corrections, public.order_correction_items to authenticated;

drop policy if exists "order corrections: manager read" on public.order_corrections;
create policy "order corrections: manager read" on public.order_corrections
  for select to authenticated using (public.is_active_user() and public.is_manager());
drop policy if exists "order correction items: manager read" on public.order_correction_items;
create policy "order correction items: manager read" on public.order_correction_items
  for select to authenticated using (public.is_active_user() and public.is_manager());

create or replace function public.recalculate_order_correction(p_correction_id uuid)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_correction public.order_corrections;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  select * into v_correction from public.order_corrections where id = p_correction_id for update;
  if not found or v_correction.status <> 'draft' then raise exception 'ไม่พบ Draft แก้ไขบิลที่ยังใช้งาน'; end if;

  select coalesce(round(sum(line_total), 2), 0) into v_subtotal
  from public.order_correction_items where correction_id = p_correction_id;
  v_discount := case v_correction.discount_type
    when 'percent' then round(v_subtotal * v_correction.discount_value / 100, 2)
    when 'fixed' then v_correction.discount_value
    else 0
  end;
  if v_discount > v_subtotal then raise exception 'ยอดส่วนลดสูงกว่ายอดอาหาร'; end if;

  update public.order_corrections
  set subtotal = v_subtotal, discount = v_discount, total = v_subtotal - v_discount
  where id = p_correction_id
  returning * into v_correction;
  return v_correction;
end;
$$;

create or replace function public.start_order_correction(
  p_order_id uuid, p_reason text, p_client_request_id uuid
)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_source public.orders;
  v_correction public.order_corrections;
  v_root_order_id uuid;
  v_revision_no integer;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่แก้ไขบิลได้'; end if;
  if p_client_request_id is null then raise exception 'ต้องระบุรหัสคำขอ'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'ต้องระบุเหตุผลการแก้ไขบิล'; end if;

  select * into v_source from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบรายการบิล'; end if;
  if v_source.status <> 'paid' or v_source.superseded_by_order_id is not null then
    raise exception 'แก้ไขได้เฉพาะบิล paid ฉบับล่าสุดเท่านั้น';
  end if;

  select * into v_correction from public.order_corrections where client_request_id = p_client_request_id;
  if found then return v_correction; end if;
  if exists (select 1 from public.order_corrections where source_order_id = p_order_id and status = 'draft') then
    raise exception 'บิลนี้มี Draft แก้ไขที่กำลังดำเนินการอยู่';
  end if;

  v_root_order_id := coalesce(v_source.root_order_id, v_source.id);
  v_revision_no := coalesce(v_source.revision_no, 0) + 1;
  insert into public.order_corrections (
    source_order_id, root_order_id, revision_no, reason, table_id, receipt_mode,
    discount_type, discount_value, discount_reason, business_at, client_request_id, created_by
  ) values (
    p_order_id, v_root_order_id, v_revision_no, btrim(p_reason), v_source.table_id, v_source.receipt_mode,
    v_source.discount_type, v_source.discount_value, v_source.discount_reason, coalesce(v_source.business_at, v_source.closed_at, now()),
    p_client_request_id, v_user_id
  ) returning * into v_correction;

  insert into public.order_correction_items (
    correction_id, product_id, product_name_snapshot, unit_price, quantity, line_total
  )
  select v_correction.id, product_id, product_name_snapshot, unit_price, quantity, line_total
  from public.order_items where order_id = p_order_id order by created_at;

  v_correction := public.recalculate_order_correction(v_correction.id);
  insert into public.audit_events (actor_id, entity_type, entity_id, action, reason, metadata)
  values (v_user_id, 'order', p_order_id, 'correction_start', btrim(p_reason),
    jsonb_build_object('correction_id', v_correction.id, 'revision_no', v_revision_no));
  return v_correction;
end;
$$;

create or replace function public.add_order_correction_item(
  p_correction_id uuid, p_product_id uuid, p_quantity numeric default 1
)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_correction public.order_corrections;
  v_product public.products;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_quantity <= 0 then raise exception 'จำนวนรายการต้องมากกว่า 0'; end if;
  select * into v_correction from public.order_corrections where id = p_correction_id for update;
  if not found or v_correction.status <> 'draft' then raise exception 'ไม่พบ Draft แก้ไขบิลที่ยังใช้งาน'; end if;
  select * into v_product from public.products where id = p_product_id and active;
  if not found then raise exception 'ไม่พบสินค้าที่เปิดขาย'; end if;
  insert into public.order_correction_items (correction_id, product_id, product_name_snapshot, unit_price, quantity, line_total)
  values (p_correction_id, v_product.id, v_product.name, v_product.price, p_quantity, round(v_product.price * p_quantity, 2))
  on conflict (correction_id, product_id) where product_id is not null do update
  set quantity = order_correction_items.quantity + excluded.quantity,
      line_total = round(order_correction_items.unit_price * (order_correction_items.quantity + excluded.quantity), 2);
  return public.recalculate_order_correction(p_correction_id);
end;
$$;

create or replace function public.set_order_correction_item_quantity(p_item_id uuid, p_quantity numeric)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_correction_id uuid;
  v_unit_price numeric(12,2);
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  select correction_id, unit_price into v_correction_id, v_unit_price from public.order_correction_items where id = p_item_id;
  if not found then raise exception 'ไม่พบรายการอาหาร'; end if;
  if not exists (select 1 from public.order_corrections where id = v_correction_id and status = 'draft') then
    raise exception 'ไม่พบ Draft แก้ไขบิลที่ยังใช้งาน';
  end if;
  if p_quantity <= 0 then
    delete from public.order_correction_items where id = p_item_id;
  else
    update public.order_correction_items set quantity = p_quantity, line_total = round(v_unit_price * p_quantity, 2) where id = p_item_id;
  end if;
  return public.recalculate_order_correction(v_correction_id);
end;
$$;

create or replace function public.set_order_correction_receipt_mode(
  p_correction_id uuid, p_receipt_mode public.receipt_mode
)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare v_correction public.order_corrections;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  select * into v_correction from public.order_corrections where id = p_correction_id and status = 'draft' for update;
  if not found then raise exception 'ไม่พบ Draft แก้ไขบิลที่ยังใช้งาน'; end if;
  update public.order_corrections set receipt_mode = p_receipt_mode where id = p_correction_id returning * into v_correction;
  return v_correction;
end;
$$;

create or replace function public.apply_order_correction_discount(
  p_correction_id uuid, p_discount_type public.discount_type, p_discount_value numeric, p_reason text
)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_correction public.order_corrections;
  v_discount numeric(12,2);
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  if p_discount_type not in ('percent', 'fixed') or p_discount_value <= 0 or length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'ส่วนลดต้องมีประเภท จำนวน และเหตุผล';
  end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then raise exception 'ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100'; end if;
  select * into v_correction from public.order_corrections where id = p_correction_id and status = 'draft' for update;
  if not found then raise exception 'ไม่พบ Draft แก้ไขบิลที่ยังใช้งาน'; end if;
  v_discount := case when p_discount_type = 'percent' then round(v_correction.subtotal * p_discount_value / 100, 2) else p_discount_value end;
  if v_discount > v_correction.subtotal then raise exception 'ยอดส่วนลดสูงกว่ายอดอาหาร'; end if;
  update public.order_corrections
  set discount_type = p_discount_type, discount_value = p_discount_value, discount_reason = btrim(p_reason), discount = v_discount, total = subtotal - v_discount
  where id = p_correction_id returning * into v_correction;
  return v_correction;
end;
$$;

create or replace function public.clear_order_correction_discount(p_correction_id uuid)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare v_correction public.order_corrections;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  select * into v_correction from public.order_corrections where id = p_correction_id and status = 'draft' for update;
  if not found then raise exception 'ไม่พบ Draft แก้ไขบิลที่ยังใช้งาน'; end if;
  update public.order_corrections set discount_type = 'none', discount_value = 0, discount_reason = null, discount = 0, total = subtotal
  where id = p_correction_id returning * into v_correction;
  return v_correction;
end;
$$;

create or replace function public.cancel_order_correction(p_correction_id uuid)
returns public.order_corrections
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_correction public.order_corrections;
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  select * into v_correction from public.order_corrections where id = p_correction_id for update;
  if not found or v_correction.status <> 'draft' then raise exception 'ไม่พบ Draft แก้ไขบิลที่ยังใช้งาน'; end if;
  update public.order_corrections set status = 'cancelled', cancelled_by = v_user_id, cancelled_at = now()
  where id = p_correction_id returning * into v_correction;
  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (v_user_id, 'order', v_correction.source_order_id, 'correction_cancel', jsonb_build_object('correction_id', p_correction_id));
  return v_correction;
end;
$$;

create or replace function public.finalize_order_correction(
  p_correction_id uuid,
  p_refund_method public.payment_method,
  p_new_payment_method public.payment_method,
  p_new_received_amount numeric,
  p_new_transfer_reference text default null,
  p_refund_transfer_reference text default null
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

  select coalesce(to_jsonb(s) - 'singleton' - 'updated_at', '{}'::jsonb) into v_store
  from public.store_settings s where s.singleton;
  select jsonb_build_object('number', t.table_number, 'name', coalesce(t.display_name, t.table_number)) into v_table
  from public.dining_tables t where t.id = v_new_order.table_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', oi.product_name_snapshot, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total
  ) order by oi.created_at), '[]'::jsonb) into v_items
  from public.order_items oi where oi.order_id = v_new_order.id;

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
  where order_id = v_source.id and id <> v_receipt.id;
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
  values (v_user_id, 'order', v_new_order.id, 'correction_finalize',
    jsonb_build_object('correction_id', p_correction_id, 'source_order_id', v_source.id, 'refund_id', v_refund.id,
      'payment_id', v_new_payment.id, 'receipt_id', v_receipt.id));
  return v_result;
end;
$$;

revoke all on function public.recalculate_order_correction(uuid) from public;
revoke all on function public.start_order_correction(uuid, text, uuid) from public;
revoke all on function public.add_order_correction_item(uuid, uuid, numeric) from public;
revoke all on function public.set_order_correction_item_quantity(uuid, numeric) from public;
revoke all on function public.set_order_correction_receipt_mode(uuid, public.receipt_mode) from public;
revoke all on function public.apply_order_correction_discount(uuid, public.discount_type, numeric, text) from public;
revoke all on function public.clear_order_correction_discount(uuid) from public;
revoke all on function public.cancel_order_correction(uuid) from public;
revoke all on function public.finalize_order_correction(uuid, public.payment_method, public.payment_method, numeric, text, text) from public;

grant execute on function public.start_order_correction(uuid, text, uuid) to authenticated;
grant execute on function public.add_order_correction_item(uuid, uuid, numeric) to authenticated;
grant execute on function public.set_order_correction_item_quantity(uuid, numeric) to authenticated;
grant execute on function public.set_order_correction_receipt_mode(uuid, public.receipt_mode) to authenticated;
grant execute on function public.apply_order_correction_discount(uuid, public.discount_type, numeric, text) to authenticated;
grant execute on function public.clear_order_correction_discount(uuid) to authenticated;
grant execute on function public.cancel_order_correction(uuid) to authenticated;
grant execute on function public.finalize_order_correction(uuid, public.payment_method, public.payment_method, numeric, text, text) to authenticated;

comment on table public.order_corrections is 'Manager-only drafts for correcting paid orders. Financial effects happen only on finalization.';
comment on column public.orders.business_at is 'Original sale timestamp used for reporting; closed_at remains the actual transaction timestamp.';

create or replace function public.request_receipt_print(p_receipt_id uuid)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_receipt public.receipts;
begin
  select r.* into v_receipt from public.receipts r join public.orders o on o.id = r.order_id where r.id = p_receipt_id for update of r;
  if not found then raise exception 'ไม่พบใบเสร็จ'; end if;
  if v_receipt.is_superseded then raise exception 'ใบเสร็จนี้ถูกแทนที่ด้วย Revision ใหม่แล้ว'; end if;
  if not public.is_manager() and not exists (select 1 from public.orders where id = v_receipt.order_id and opened_by = v_user_id) then
    raise exception 'คุณไม่มีสิทธิ์พิมพ์ใบเสร็จนี้';
  end if;
  update public.receipts set print_status = 'pending', print_requested_at = now(), print_requested_by = v_user_id,
    print_claimed_at = null, print_claimed_by = null, last_error = null where id = p_receipt_id returning * into v_receipt;
  insert into public.audit_events (actor_id, entity_type, entity_id, action) values (v_user_id, 'receipt', p_receipt_id, 'print_request');
  return v_receipt;
end;
$$;

-- Reports expose only the latest revision of a bill. The report date remains
-- the original sale date while actual correction timestamps stay in audit data.
drop function if exists public.list_sales_history_page(timestamptz, timestamptz, bigint, timestamptz, uuid, integer);
create or replace function public.list_sales_history_page(
  p_from timestamptz, p_to timestamptz, p_order_number bigint default null,
  p_cursor_closed_at timestamptz default null, p_cursor_order_id uuid default null,
  p_limit integer default 25
)
returns table (
  order_id uuid, order_number bigint, display_order_number text, revision_no integer, table_name text, status public.order_status,
  receipt_mode public.receipt_mode, subtotal numeric, discount numeric, total numeric,
  opened_by uuid, closed_at timestamptz, payment_method public.payment_method,
  refund_amount numeric, receipt_id uuid
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_page_size integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return query
  select o.id, coalesce(root.order_number, o.order_number), case when o.revision_no > 0 then coalesce(root.order_number, o.order_number)::text || '-R' || o.revision_no else coalesce(root.order_number, o.order_number)::text end, o.revision_no, coalesce(t.display_name, t.table_number, 'ไม่ระบุ'), o.status, o.receipt_mode,
    o.subtotal, o.discount, o.total, o.opened_by, coalesce(o.business_at, o.closed_at), p.method,
    coalesce(r.amount, 0), rc.id
  from public.orders o
  left join public.orders root on root.id = coalesce(o.root_order_id, o.id)
  left join public.dining_tables t on t.id = o.table_id
  left join public.payments p on p.order_id = o.id
  left join public.refunds r on r.order_id = o.id and r.kind = 'customer_refund'
  left join lateral (select receipts.id from public.receipts where receipts.order_id = o.id and not receipts.is_superseded order by print_number desc limit 1) rc on true
  where coalesce(o.business_at, o.closed_at) >= p_from and coalesce(o.business_at, o.closed_at) < p_to
    and o.superseded_by_order_id is null
    and (o.opened_by = v_user_id or public.is_manager())
    and (p_order_number is null or coalesce(root.order_number, o.order_number) = p_order_number)
    and (p_cursor_closed_at is null or (coalesce(o.business_at, o.closed_at), o.id) < (p_cursor_closed_at, p_cursor_order_id))
  order by coalesce(o.business_at, o.closed_at) desc, o.id desc
  limit v_page_size + 1;
end;
$$;

drop function if exists public.list_sales_history(timestamptz, timestamptz, bigint);
create or replace function public.list_sales_history(
  p_from timestamptz, p_to timestamptz, p_order_number bigint default null
)
returns table (
  order_id uuid, order_number bigint, display_order_number text, revision_no integer, table_name text, status public.order_status,
  receipt_mode public.receipt_mode, subtotal numeric, discount numeric, total numeric,
  opened_by uuid, closed_at timestamptz, payment_method public.payment_method,
  refund_amount numeric, receipt_id uuid
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := public.require_active_user();
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  return query
  select o.id, coalesce(root.order_number, o.order_number), case when o.revision_no > 0 then coalesce(root.order_number, o.order_number)::text || '-R' || o.revision_no else coalesce(root.order_number, o.order_number)::text end, o.revision_no, coalesce(t.display_name, t.table_number, 'ไม่ระบุ'), o.status, o.receipt_mode,
    o.subtotal, o.discount, o.total, o.opened_by, coalesce(o.business_at, o.closed_at), p.method,
    coalesce(r.amount, 0), rc.id
  from public.orders o
  left join public.orders root on root.id = coalesce(o.root_order_id, o.id)
  left join public.dining_tables t on t.id = o.table_id
  left join public.payments p on p.order_id = o.id
  left join public.refunds r on r.order_id = o.id and r.kind = 'customer_refund'
  left join lateral (select receipts.id from public.receipts where receipts.order_id = o.id and not receipts.is_superseded order by print_number desc limit 1) rc on true
  where coalesce(o.business_at, o.closed_at) >= p_from and coalesce(o.business_at, o.closed_at) < p_to
    and o.superseded_by_order_id is null
    and (o.opened_by = v_user_id or public.is_manager())
    and (p_order_number is null or coalesce(root.order_number, o.order_number) = p_order_number)
  order by coalesce(o.business_at, o.closed_at) desc, o.id desc;
end;
$$;

create or replace function public.get_sales_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_summary jsonb;
  v_products jsonb;
  v_sellers jsonb;
  v_tables jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  with scoped_orders as (
    select o.* from public.orders o
    where coalesce(o.business_at, o.closed_at) >= p_from and coalesce(o.business_at, o.closed_at) < p_to
      and o.superseded_by_order_id is null and (o.opened_by = v_user_id or public.is_manager())
  ), sales as (select * from scoped_orders where status in ('paid', 'refunded')),
  refund_totals as (
    select coalesce(sum(r.amount), 0) as amount from public.refunds r join sales s on s.id = r.order_id where r.kind = 'customer_refund'
  )
  select jsonb_build_object(
    'paid_order_count', (select count(*) from sales where status = 'paid'),
    'void_order_count', (select count(*) from scoped_orders where status = 'void'),
    'refunded_order_count', (select count(*) from sales where status = 'refunded'),
    'corrected_order_count', (select count(*) from scoped_orders where revision_no > 0),
    'sales_total', coalesce((select sum(total) from sales), 0),
    'discount_total', coalesce((select sum(discount) from sales), 0),
    'refund_total', (select amount from refund_totals),
    'net_total', coalesce((select sum(total) from sales), 0) - (select amount from refund_totals),
    'cash_total', coalesce((select sum(p.amount) from public.payments p join sales s on s.id = p.order_id where p.method = 'cash'), 0),
    'transfer_total', coalesce((select sum(p.amount) from public.payments p join sales s on s.id = p.order_id where p.method = 'transfer'), 0)
  ) into v_summary;

  with sales as (
    select o.id from public.orders o where coalesce(o.business_at, o.closed_at) >= p_from and coalesce(o.business_at, o.closed_at) < p_to
      and o.status in ('paid', 'refunded') and o.superseded_by_order_id is null and (o.opened_by = v_user_id or public.is_manager())
  ), grouped as (
    select oi.product_name_snapshot as product_name, oi.category_name_snapshot as category_name, sum(oi.quantity) as quantity, sum(oi.line_total) as total
    from public.order_items oi join sales s on s.id = oi.order_id group by oi.product_name_snapshot, oi.category_name_snapshot
  ) select coalesce(jsonb_agg(to_jsonb(grouped) order by total desc), '[]'::jsonb) into v_products from grouped;

  with sales as (
    select o.opened_by, o.total from public.orders o where coalesce(o.business_at, o.closed_at) >= p_from and coalesce(o.business_at, o.closed_at) < p_to
      and o.status in ('paid', 'refunded') and o.superseded_by_order_id is null and (o.opened_by = v_user_id or public.is_manager())
  ), grouped as (
    select s.opened_by, coalesce(pr.display_name, 'ไม่ระบุ') as seller_name, count(*) as bill_count, sum(s.total) as total
    from sales s left join public.profiles pr on pr.id = s.opened_by group by s.opened_by, pr.display_name
  ) select coalesce(jsonb_agg(to_jsonb(grouped) order by total desc), '[]'::jsonb) into v_sellers from grouped;

  with sales as (
    select o.table_id, o.total from public.orders o where coalesce(o.business_at, o.closed_at) >= p_from and coalesce(o.business_at, o.closed_at) < p_to
      and o.status in ('paid', 'refunded') and o.superseded_by_order_id is null and (o.opened_by = v_user_id or public.is_manager())
  ), grouped as (
    select s.table_id, coalesce(t.display_name, t.table_number, 'ไม่ระบุ') as table_name, count(*) as bill_count, sum(s.total) as total
    from sales s left join public.dining_tables t on t.id = s.table_id group by s.table_id, t.display_name, t.table_number
  ) select coalesce(jsonb_agg(to_jsonb(grouped) order by total desc), '[]'::jsonb) into v_tables from grouped;
  return jsonb_build_object('summary', v_summary, 'products', v_products, 'sellers', v_sellers, 'tables', v_tables);
end;
$$;

grant execute on function public.list_sales_history(timestamptz, timestamptz, bigint) to authenticated;
grant execute on function public.list_sales_history_page(timestamptz, timestamptz, bigint, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_sales_report(timestamptz, timestamptz) to authenticated;
