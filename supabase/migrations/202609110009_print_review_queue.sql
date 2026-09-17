-- Phase 6B: recover interrupted print jobs into a manager review queue.

alter type public.print_status add value if not exists 'review_required';
alter type public.print_status add value if not exists 'cancelled';

alter table public.receipts
  add column if not exists lease_expires_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

create index if not exists receipts_print_review_idx on public.receipts(print_status, print_requested_at);
create index if not exists receipts_print_lease_idx on public.receipts(lease_expires_at) where print_status = 'printing';

drop function if exists public.bridge_complete_receipt_print(uuid, boolean, text);
create or replace function public.bridge_complete_receipt_print(
  p_receipt_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_error text default null,
  p_requires_review boolean default false
)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_receipt public.receipts;
begin
  if auth.role() <> 'service_role' then raise exception 'เฉพาะ print bridge เท่านั้นที่บันทึกผลพิมพ์ได้'; end if;
  select * into v_receipt from public.receipts where id = p_receipt_id and claim_token = p_claim_token and print_status = 'printing' and lease_expires_at > now() for update;
  if not found then raise exception 'ไม่พบงานพิมพ์ที่ bridge ถือครองอยู่'; end if;
  update public.receipts
  set print_status = case when p_success then 'printed' when p_requires_review then 'review_required' else 'failed' end,
      printed_at = case when p_success then now() else printed_at end,
      last_error = case when p_success then null else left(coalesce(nullif(btrim(p_error), ''), 'ไม่สามารถพิมพ์ได้'), 500) end,
      lease_expires_at = null, claim_token = null, print_claimed_at = null
  where id = p_receipt_id returning * into v_receipt;
  return v_receipt;
end;
$$;

create or replace function public.bridge_claim_next_receipt(p_bridge_id text)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_receipt public.receipts;
begin
  if auth.role() <> 'service_role' then raise exception 'เฉพาะ print bridge เท่านั้นที่รับงานพิมพ์ได้'; end if;
  if length(btrim(coalesce(p_bridge_id, ''))) = 0 then raise exception 'ต้องระบุ bridge id'; end if;

  update public.receipts
  set print_status = 'review_required',
      last_error = 'งานพิมพ์หมดเวลาและต้องตรวจสอบก่อนส่งใหม่',
      lease_expires_at = null,
      claim_token = null,
      print_claimed_at = null
  where print_status = 'printing' and lease_expires_at is not null and lease_expires_at <= now();

  select * into v_receipt
  from public.receipts
  where print_status = 'pending' and print_requested_at is not null and print_attempts < 3
  order by print_requested_at asc
  for update skip locked limit 1;
  if not found then return null; end if;

  update public.receipts
  set print_status = 'printing', print_attempts = print_attempts + 1,
      print_claimed_at = now(), print_claimed_by = btrim(p_bridge_id),
      lease_expires_at = now() + interval '2 minutes', claim_token = gen_random_uuid()
  where id = v_receipt.id returning * into v_receipt;
  return v_receipt;
end;
$$;

create or replace function public.list_print_queue()
returns setof public.receipts
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  return query select * from public.receipts where print_status in ('pending', 'printing', 'failed', 'review_required') order by created_at desc;
end;
$$;

create or replace function public.manager_requeue_receipt(p_receipt_id uuid)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_receipt public.receipts; v_user_id uuid := public.require_active_user();
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  update public.receipts set print_status = 'pending', print_requested_at = now(), lease_expires_at = null, claim_token = null,
    print_claimed_at = null, print_claimed_by = null, reviewed_by = v_user_id, reviewed_at = now(), last_error = null
  where id = p_receipt_id and print_status in ('failed', 'review_required') and print_attempts < 3 returning * into v_receipt;
  if not found then raise exception 'งานนี้ไม่พร้อมส่งพิมพ์ใหม่หรือเกินจำนวนครั้งที่กำหนด'; end if;
  return v_receipt;
end;
$$;

create or replace function public.manager_mark_receipt_printed(p_receipt_id uuid)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_receipt public.receipts; v_user_id uuid := public.require_active_user();
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  update public.receipts set print_status = 'printed', printed_at = coalesce(printed_at, now()), lease_expires_at = null, claim_token = null,
    print_claimed_at = null, reviewed_by = v_user_id, reviewed_at = now(), last_error = null
  where id = p_receipt_id and print_status in ('review_required', 'failed') returning * into v_receipt;
  if not found then raise exception 'ไม่พบงานพิมพ์ที่รอตรวจสอบ'; end if;
  return v_receipt;
end;
$$;

create or replace function public.manager_cancel_receipt(p_receipt_id uuid)
returns public.receipts
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_receipt public.receipts; v_user_id uuid := public.require_active_user();
begin
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้น'; end if;
  update public.receipts set print_status = 'cancelled', lease_expires_at = null, claim_token = null,
    print_claimed_at = null, reviewed_by = v_user_id, reviewed_at = now()
  where id = p_receipt_id and print_status in ('pending', 'failed', 'review_required') returning * into v_receipt;
  if not found then raise exception 'ไม่พบงานพิมพ์ที่ยกเลิกได้'; end if;
  return v_receipt;
end;
$$;

revoke all on function public.bridge_claim_next_receipt(text) from public;
revoke all on function public.bridge_complete_receipt_print(uuid, uuid, boolean, text, boolean) from public;
revoke all on function public.list_print_queue() from public;
revoke all on function public.manager_requeue_receipt(uuid) from public;
revoke all on function public.manager_mark_receipt_printed(uuid) from public;
revoke all on function public.manager_cancel_receipt(uuid) from public;
grant execute on function public.bridge_claim_next_receipt(text) to service_role;
grant execute on function public.bridge_complete_receipt_print(uuid, uuid, boolean, text, boolean) to service_role;
grant execute on function public.list_print_queue() to authenticated;
grant execute on function public.manager_requeue_receipt(uuid) to authenticated;
grant execute on function public.manager_mark_receipt_printed(uuid) to authenticated;
grant execute on function public.manager_cancel_receipt(uuid) to authenticated;
