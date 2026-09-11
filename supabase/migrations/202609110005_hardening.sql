-- Phase 4: close inactive-account paths and keep mutable timestamps consistent.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select coalesce((select role = 'manager' and active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_updated_at_trigger on public.products;
create trigger products_updated_at_trigger before update on public.products
for each row execute procedure public.set_updated_at();

drop trigger if exists store_settings_updated_at_trigger on public.store_settings;
create trigger store_settings_updated_at_trigger before update on public.store_settings
for each row execute procedure public.set_updated_at();

drop policy if exists "store settings: read authenticated" on public.store_settings;
drop policy if exists "store settings: manager update" on public.store_settings;
create policy "store settings: read active authenticated" on public.store_settings for select to authenticated
  using (public.is_active_user());
create policy "store settings: active manager update" on public.store_settings for update to authenticated
  using (public.is_active_user() and public.is_manager()) with check (public.is_active_user() and public.is_manager());

drop policy if exists "categories: read active or manager" on public.categories;
drop policy if exists "categories: manager insert" on public.categories;
drop policy if exists "categories: manager update" on public.categories;
drop policy if exists "categories: manager delete" on public.categories;
create policy "categories: read active user" on public.categories for select to authenticated
  using (public.is_active_user() and (active or public.is_manager()));
create policy "categories: active manager insert" on public.categories for insert to authenticated
  with check (public.is_active_user() and public.is_manager());
create policy "categories: active manager update" on public.categories for update to authenticated
  using (public.is_active_user() and public.is_manager()) with check (public.is_active_user() and public.is_manager());
create policy "categories: active manager delete" on public.categories for delete to authenticated
  using (public.is_active_user() and public.is_manager());

drop policy if exists "products: read active or manager" on public.products;
drop policy if exists "products: manager insert" on public.products;
drop policy if exists "products: manager update" on public.products;
drop policy if exists "products: manager delete" on public.products;
create policy "products: read active user" on public.products for select to authenticated
  using (public.is_active_user() and (active or public.is_manager()));
create policy "products: active manager insert" on public.products for insert to authenticated
  with check (public.is_active_user() and public.is_manager());
create policy "products: active manager update" on public.products for update to authenticated
  using (public.is_active_user() and public.is_manager()) with check (public.is_active_user() and public.is_manager());
create policy "products: active manager delete" on public.products for delete to authenticated
  using (public.is_active_user() and public.is_manager());

drop policy if exists "tables: read active or manager" on public.dining_tables;
drop policy if exists "tables: manager insert" on public.dining_tables;
drop policy if exists "tables: manager update" on public.dining_tables;
drop policy if exists "tables: manager delete" on public.dining_tables;
create policy "tables: read active user" on public.dining_tables for select to authenticated
  using (public.is_active_user() and (active or public.is_manager()));
create policy "tables: active manager insert" on public.dining_tables for insert to authenticated
  with check (public.is_active_user() and public.is_manager());
create policy "tables: active manager update" on public.dining_tables for update to authenticated
  using (public.is_active_user() and public.is_manager()) with check (public.is_active_user() and public.is_manager());
create policy "tables: active manager delete" on public.dining_tables for delete to authenticated
  using (public.is_active_user() and public.is_manager());

drop policy if exists "orders: read own or manager" on public.orders;
drop policy if exists "order items: read own order or manager" on public.order_items;
drop policy if exists "payments: read own order or manager" on public.payments;
drop policy if exists "refunds: read own order or manager" on public.refunds;
drop policy if exists "receipts: read own order or manager" on public.receipts;
drop policy if exists "audit events: read own or manager" on public.audit_events;
create policy "orders: read active own or manager" on public.orders for select to authenticated
  using (public.is_active_user() and (opened_by = auth.uid() or public.is_manager()));
create policy "order items: read active own order or manager" on public.order_items for select to authenticated
  using (public.is_active_user() and exists (select 1 from public.orders where orders.id = order_items.order_id and (orders.opened_by = auth.uid() or public.is_manager())));
create policy "payments: read active own order or manager" on public.payments for select to authenticated
  using (public.is_active_user() and exists (select 1 from public.orders where orders.id = payments.order_id and (orders.opened_by = auth.uid() or public.is_manager())));
create policy "refunds: read active own order or manager" on public.refunds for select to authenticated
  using (public.is_active_user() and exists (select 1 from public.orders where orders.id = refunds.order_id and (orders.opened_by = auth.uid() or public.is_manager())));
create policy "receipts: read active own order or manager" on public.receipts for select to authenticated
  using (public.is_active_user() and exists (select 1 from public.orders where orders.id = receipts.order_id and (orders.opened_by = auth.uid() or public.is_manager())));
create policy "audit events: read active own or manager" on public.audit_events for select to authenticated
  using (public.is_active_user() and (actor_id = auth.uid() or public.is_manager()));

revoke all on function public.is_active_user() from public;
revoke all on function public.set_updated_at() from public;
grant execute on function public.is_active_user() to authenticated;
