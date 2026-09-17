-- Permanently removes a bill and its complete correction revision chain.
-- Audit events are intentionally retained so the destructive action remains traceable.
create or replace function public.delete_sales_history_order(p_order_id uuid)
returns integer
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
  v_root_order_id uuid;
  v_order_ids uuid[];
  v_deleted_count integer;
begin
  if not public.is_manager() then
    raise exception 'เฉพาะผู้จัดการเท่านั้นที่ลบบิลย้อนหลังได้';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ไม่พบรายการบิล';
  end if;

  v_root_order_id := coalesce(v_order.root_order_id, v_order.id);
  select array_agg(id) into v_order_ids
  from public.orders
  where coalesce(root_order_id, id) = v_root_order_id;

  -- Keep a deletion trail without keeping the financial records themselves.
  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
  values (
    v_user_id,
    'order',
    v_order.id,
    'delete_history',
    jsonb_build_object(
      'order_number', v_order.order_number,
      'status', v_order.status,
      'root_order_id', v_root_order_id,
      'total', v_order.total,
      'deleted_at', now()
    )
  );

  -- Remove correction records first because they reference every order in the revision chain.
  delete from public.order_corrections
  where root_order_id = v_root_order_id
     or source_order_id = any(v_order_ids)
     or replacement_order_id = any(v_order_ids);

  -- Break receipt self-references before deleting the receipt rows.
  update public.receipts
  set supersedes_receipt_id = null
  where order_id = any(v_order_ids);

  delete from public.refunds
  where order_id = any(v_order_ids)
     or payment_id in (
       select id from public.payments
       where order_id = any(v_order_ids)
     );
  delete from public.receipts
  where order_id = any(v_order_ids);
  delete from public.order_items
  where order_id = any(v_order_ids);
  delete from public.payments
  where order_id = any(v_order_ids);

  -- Break order self-references before removing the full revision chain.
  update public.orders
  set root_order_id = null, superseded_by_order_id = null, correction_id = null
  where id = any(v_order_ids);

  delete from public.orders
  where id = any(v_order_ids);
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.delete_sales_history_order(uuid) from public, anon;
grant execute on function public.delete_sales_history_order(uuid) to authenticated;
