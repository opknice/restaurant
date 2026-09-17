-- Keep product details and their subcategory links consistent when a manager edits a product.
create or replace function public.update_product(
  p_product_id uuid,
  p_category_id uuid,
  p_name text,
  p_price numeric,
  p_subcategory_ids uuid[] default '{}'::uuid[]
)
returns public.products
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_product public.products;
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่แก้ไขสินค้าได้'; end if;
  if not exists (select 1 from public.categories where id = p_category_id and active) then
    raise exception 'ไม่พบหมวดสินค้าที่ใช้งานได้';
  end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'กรุณาระบุชื่อสินค้า'; end if;
  if p_price is null or p_price < 0 then raise exception 'ราคาสินค้าไม่ถูกต้อง'; end if;

  update public.products
  set category_id = p_category_id, name = btrim(p_name), price = p_price
  where id = p_product_id
  returning * into v_product;
  if v_product.id is null then raise exception 'ไม่พบสินค้า'; end if;

  perform public.replace_product_subcategories(v_product.id, p_subcategory_ids);
  return v_product;
end;
$$;

revoke all on function public.update_product(uuid, uuid, text, numeric, uuid[]) from public, anon;
grant execute on function public.update_product(uuid, uuid, text, numeric, uuid[]) to authenticated;

-- Repair environments where the singleton seed was skipped, without
-- overwriting any store configuration that may already exist.
insert into public.store_settings (singleton, store_name)
values (true, 'กรุณาตั้งชื่อร้าน')
on conflict (singleton) do nothing;

-- Allow a manager to recreate the singleton safely if it is ever removed.
drop policy if exists "store settings: manager insert" on public.store_settings;
create policy "store settings: manager insert" on public.store_settings
for insert to authenticated
with check ((select public.is_active_user()) and (select public.is_manager()));

-- These tables are intentionally accessed through manager-only RPCs. Explicit
-- deny policies document that direct Data API access is not part of the model.
drop policy if exists "employees: no direct client access" on public.employees;
create policy "employees: no direct client access" on public.employees
for all to authenticated using (false) with check (false);

drop policy if exists "expenses: no direct client access" on public.expenses;
create policy "expenses: no direct client access" on public.expenses
for all to authenticated using (false) with check (false);

-- Empty orders can be created while opening a table. Let the active owner or
-- a manager release one without requiring a fabricated cancellation reason.
create or replace function public.cancel_empty_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_order public.orders;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'ไม่พบบิล'; end if;
  if v_order.status <> 'open' then raise exception 'ยกเลิกได้เฉพาะบิลที่ยังไม่ชำระ'; end if;
  if exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception 'บิลนี้มีรายการอาหารแล้ว กรุณาใช้การยกเลิกบิลตามขั้นตอนปกติ';
  end if;
  if v_order.opened_by <> v_user_id and not public.is_manager() then
    raise exception 'คุณไม่มีสิทธิ์ยกเลิกบิลว่างนี้';
  end if;

  update public.orders
  set status = 'void',
      void_reason = 'ยกเลิกบิลว่าง',
      closed_by = v_user_id,
      closed_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.audit_events(actor_id, entity_type, entity_id, action, reason)
  values (v_user_id, 'order', p_order_id, 'void_empty_order', 'ยกเลิกบิลว่าง');
  return v_order;
end;
$$;

revoke all on function public.cancel_empty_order(uuid) from public, anon;
grant execute on function public.cancel_empty_order(uuid) to authenticated;
