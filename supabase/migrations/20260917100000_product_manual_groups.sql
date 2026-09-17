-- Manager-controlled product grouping for the POS menu.
-- A NULL/blank group intentionally appears in the POS under "อื่นๆ".
alter table public.products add column if not exists group_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_group_name_not_blank'
  ) then
    alter table public.products
      add constraint products_group_name_not_blank
      check (group_name is null or btrim(group_name) <> '');
  end if;
end;
$$;

-- New signature used by the current manager UI. The old signature remains as
-- a compatibility wrapper for already-deployed clients during rollout.
create or replace function public.create_product(
  p_category_id uuid,
  p_name text,
  p_price numeric,
  p_subcategory_ids uuid[],
  p_group_name text
)
returns public.products
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_product public.products;
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่เพิ่มสินค้าได้'; end if;
  if not exists (select 1 from public.categories where id = p_category_id and active) then
    raise exception 'ไม่พบหมวดสินค้าที่ใช้งานได้';
  end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'กรุณาระบุชื่อสินค้า'; end if;
  if p_price is null or p_price < 0 then raise exception 'ราคาสินค้าไม่ถูกต้อง'; end if;

  insert into public.products(category_id, name, price, group_name)
  values (p_category_id, btrim(p_name), p_price, nullif(btrim(coalesce(p_group_name, '')), ''))
  returning * into v_product;
  perform public.replace_product_subcategories(v_product.id, p_subcategory_ids);
  return v_product;
end;
$$;

create or replace function public.create_product(
  p_category_id uuid,
  p_name text,
  p_price numeric,
  p_subcategory_ids uuid[] default '{}'::uuid[]
)
returns public.products
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  return public.create_product(p_category_id, p_name, p_price, p_subcategory_ids, null);
end;
$$;

-- New signature used by the current manager UI. The old signature remains as
-- a compatibility wrapper for already-deployed clients during rollout.
create or replace function public.update_product(
  p_product_id uuid,
  p_category_id uuid,
  p_name text,
  p_price numeric,
  p_subcategory_ids uuid[],
  p_group_name text
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
  set category_id = p_category_id,
      name = btrim(p_name),
      price = p_price,
      group_name = nullif(btrim(coalesce(p_group_name, '')), '')
  where id = p_product_id
  returning * into v_product;
  if v_product.id is null then raise exception 'ไม่พบสินค้า'; end if;

  perform public.replace_product_subcategories(v_product.id, p_subcategory_ids);
  return v_product;
end;
$$;

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
begin
  return public.update_product(p_product_id, p_category_id, p_name, p_price, p_subcategory_ids, null);
end;
$$;

revoke all on function public.create_product(uuid, text, numeric, uuid[]) from public, anon;
revoke all on function public.create_product(uuid, text, numeric, uuid[], text) from public, anon;
grant execute on function public.create_product(uuid, text, numeric, uuid[]) to authenticated;
grant execute on function public.create_product(uuid, text, numeric, uuid[], text) to authenticated;

revoke all on function public.update_product(uuid, uuid, text, numeric, uuid[]) from public, anon;
revoke all on function public.update_product(uuid, uuid, text, numeric, uuid[], text) from public, anon;
grant execute on function public.update_product(uuid, uuid, text, numeric, uuid[]) to authenticated;
grant execute on function public.update_product(uuid, uuid, text, numeric, uuid[], text) to authenticated;
