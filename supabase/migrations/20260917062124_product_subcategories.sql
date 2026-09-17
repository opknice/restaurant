-- Product classification: one product may belong to many subcategories.
create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index subcategories_category_name_uidx
  on public.subcategories (category_id, lower(btrim(name)));

create table public.product_subcategories (
  product_id uuid not null references public.products(id) on delete cascade,
  subcategory_id uuid not null references public.subcategories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, subcategory_id)
);

create index subcategories_category_id_idx on public.subcategories(category_id);
create index product_subcategories_subcategory_id_idx on public.product_subcategories(subcategory_id);

revoke all on table public.subcategories, public.product_subcategories from anon, authenticated;
grant select, insert, update, delete on public.subcategories, public.product_subcategories to authenticated;

alter table public.subcategories enable row level security;
alter table public.product_subcategories enable row level security;

create policy "subcategories: read active or manager" on public.subcategories for select to authenticated
  using (
    (active and exists (select 1 from public.categories c where c.id = subcategories.category_id and c.active))
    or (select public.is_manager())
  );
create policy "subcategories: manager insert" on public.subcategories for insert to authenticated
  with check ((select public.is_manager()));
create policy "subcategories: manager update" on public.subcategories for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "subcategories: manager delete" on public.subcategories for delete to authenticated
  using ((select public.is_manager()));

create policy "product subcategories: read active or manager" on public.product_subcategories for select to authenticated
  using (
    (select public.is_manager())
    or exists (
      select 1
      from public.products p
      join public.subcategories s on s.id = product_subcategories.subcategory_id
      join public.categories c on c.id = s.category_id
      where p.id = product_subcategories.product_id
        and p.active and s.active and c.active
    )
  );
create policy "product subcategories: manager insert" on public.product_subcategories for insert to authenticated
  with check ((select public.is_manager()));
create policy "product subcategories: manager update" on public.product_subcategories for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "product subcategories: manager delete" on public.product_subcategories for delete to authenticated
  using ((select public.is_manager()));

create or replace function public.validate_product_subcategory_link()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_product_category uuid;
  v_subcategory_category uuid;
begin
  select category_id into v_product_category from public.products where id = new.product_id;
  select category_id into v_subcategory_category from public.subcategories where id = new.subcategory_id;
  if v_product_category is null or v_subcategory_category is null or v_product_category <> v_subcategory_category then
    raise exception 'หัวข้อย่อยต้องอยู่ในหมวดหลักเดียวกับสินค้า';
  end if;
  return new;
end;
$$;

-- This function is invoked only by the database trigger; it must not be exposed as an API RPC.
revoke all on function public.validate_product_subcategory_link() from public, anon, authenticated;

drop trigger if exists product_subcategories_category_guard on public.product_subcategories;
create trigger product_subcategories_category_guard
before insert or update on public.product_subcategories
for each row execute function public.validate_product_subcategory_link();

create or replace function public.replace_product_subcategories(
  p_product_id uuid,
  p_subcategory_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_product_category uuid;
begin
  perform public.require_active_user();
  if not public.is_manager() then raise exception 'เฉพาะผู้จัดการเท่านั้นที่แก้หัวข้อสินค้าได้'; end if;
  select category_id into v_product_category from public.products where id = p_product_id;
  if v_product_category is null then raise exception 'ไม่พบสินค้า'; end if;
  if exists (
    select 1
    from unnest(coalesce(p_subcategory_ids, '{}'::uuid[])) as requested(id)
    left join public.subcategories s on s.id = requested.id
    where s.id is null or s.category_id <> v_product_category or not s.active
  ) then
    raise exception 'หัวข้อย่อยไม่ตรงกับหมวดสินค้าหรือถูกปิดใช้งาน';
  end if;
  delete from public.product_subcategories where product_id = p_product_id;
  insert into public.product_subcategories(product_id, subcategory_id)
  select p_product_id, id from unnest(coalesce(p_subcategory_ids, '{}'::uuid[])) as requested(id)
  on conflict do nothing;
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
  insert into public.products(category_id, name, price)
  values (p_category_id, btrim(p_name), p_price)
  returning * into v_product;
  perform public.replace_product_subcategories(v_product.id, p_subcategory_ids);
  return v_product;
end;
$$;

revoke all on function public.replace_product_subcategories(uuid, uuid[]) from public, anon;
revoke all on function public.create_product(uuid, text, numeric, uuid[]) from public, anon;
grant execute on function public.replace_product_subcategories(uuid, uuid[]) to authenticated;
grant execute on function public.create_product(uuid, text, numeric, uuid[]) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subcategories') then
      alter publication supabase_realtime add table public.subcategories;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_subcategories') then
      alter publication supabase_realtime add table public.product_subcategories;
    end if;
  end if;
end;
$$;
