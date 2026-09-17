-- Permanently delete a product only when it has no historical references.
-- Products used in sales or correction drafts must be deactivated instead so
-- snapshots and audit/reporting data remain intact.
create or replace function public.delete_product(p_product_id uuid)
returns public.products
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_product public.products;
begin
  perform public.require_active_user();
  if not public.is_manager() then
    raise exception 'เฉพาะผู้จัดการเท่านั้นที่ลบสินค้าได้';
  end if;

  if exists (select 1 from public.order_items where product_id = p_product_id)
     or exists (select 1 from public.order_correction_items where product_id = p_product_id) then
    raise exception 'ลบสินค้าไม่ได้ เนื่องจากสินค้านี้ถูกใช้ในประวัติการขายหรือรายการแก้ไขบิลแล้ว กรุณาปิดการขายแทน';
  end if;

  delete from public.products
  where id = p_product_id
  returning * into v_product;

  if v_product.id is null then
    raise exception 'ไม่พบสินค้า';
  end if;

  return v_product;
end;
$$;

revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;
