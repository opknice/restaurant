-- Phase 10.4: do not rely on PL/pgSQL FOUND after other statements have run.

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

  if v_receipt.id is not null
    and v_receipt.print_requested_at is not null
    and v_receipt.print_status <> 'cancelled' then
    if v_receipt.mode <> p_receipt_mode then
      raise exception 'บิลนี้ส่งพิมพ์แล้วด้วยรูปแบบอื่น ไม่สามารถเปลี่ยนรูปแบบได้';
    end if;
    return v_receipt;
  end if;

  v_payload := public.get_order_receipt_preview(p_order_id, p_receipt_mode);
  update public.orders set receipt_mode = p_receipt_mode where id = p_order_id;

  if v_receipt.id is not null then
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

revoke all on function public.prepare_and_request_order_receipt(uuid, public.receipt_mode, uuid) from public, anon;
grant execute on function public.prepare_and_request_order_receipt(uuid, public.receipt_mode, uuid) to authenticated;
