-- Print jobs are requested by authenticated POS users, then claimed by the
-- Windows bridge using only its locally stored service-role key.

alter type public.print_status add value if not exists 'printing';

alter table public.receipts
  add column if not exists print_requested_at timestamptz,
  add column if not exists print_requested_by uuid references public.profiles(id),
  add column if not exists print_claimed_at timestamptz,
  add column if not exists print_claimed_by text;

create index if not exists receipts_pending_print_queue_idx
  on public.receipts (print_requested_at)
  where print_status = 'pending' and print_requested_at is not null;

create or replace function public.request_receipt_print(p_receipt_id uuid)
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
  where r.id = p_receipt_id
  for update of r;

  if not found then
    raise exception 'ไม่พบใบเสร็จ';
  end if;
  if not public.is_manager() and not exists (
    select 1 from public.orders where id = v_receipt.order_id and opened_by = v_user_id
  ) then
    raise exception 'คุณไม่มีสิทธิ์พิมพ์ใบเสร็จนี้';
  end if;

  update public.receipts
  set print_status = 'pending',
      print_requested_at = now(),
      print_requested_by = v_user_id,
      print_claimed_at = null,
      print_claimed_by = null,
      last_error = null
  where id = p_receipt_id
  returning * into v_receipt;

  insert into public.audit_events (actor_id, entity_type, entity_id, action)
  values (v_user_id, 'receipt', p_receipt_id, 'print_request');
  return v_receipt;
end;
$$;

create or replace function public.bridge_claim_next_receipt(p_bridge_id text)
returns public.receipts
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_receipt public.receipts;
begin
  if auth.role() <> 'service_role' then
    raise exception 'เฉพาะ print bridge เท่านั้นที่รับงานพิมพ์ได้';
  end if;
  if length(btrim(coalesce(p_bridge_id, ''))) = 0 then
    raise exception 'ต้องระบุ bridge id';
  end if;

  select * into v_receipt
  from public.receipts
  where print_status = 'pending' and print_requested_at is not null
  order by print_requested_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.receipts
  set print_status = 'printing',
      print_attempts = print_attempts + 1,
      print_claimed_at = now(),
      print_claimed_by = btrim(p_bridge_id)
  where id = v_receipt.id
  returning * into v_receipt;
  return v_receipt;
end;
$$;

create or replace function public.bridge_complete_receipt_print(
  p_receipt_id uuid,
  p_success boolean,
  p_error text default null
)
returns public.receipts
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_receipt public.receipts;
begin
  if auth.role() <> 'service_role' then
    raise exception 'เฉพาะ print bridge เท่านั้นที่บันทึกผลพิมพ์ได้';
  end if;
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found or v_receipt.print_status <> 'printing' then
    raise exception 'ไม่พบงานพิมพ์ที่กำลังดำเนินการ';
  end if;

  update public.receipts
  set print_status = case when p_success then 'printed' else 'failed' end,
      printed_at = case when p_success then now() else printed_at end,
      last_error = case when p_success then null else left(coalesce(nullif(btrim(p_error), ''), 'ไม่สามารถพิมพ์ได้'), 500) end
  where id = p_receipt_id
  returning * into v_receipt;
  return v_receipt;
end;
$$;

revoke all on function public.request_receipt_print(uuid) from public;
revoke all on function public.bridge_claim_next_receipt(text) from public;
revoke all on function public.bridge_complete_receipt_print(uuid, boolean, text) from public;

grant execute on function public.request_receipt_print(uuid) to authenticated;
grant execute on function public.bridge_claim_next_receipt(text) to service_role;
grant execute on function public.bridge_complete_receipt_print(uuid, boolean, text) to service_role;
