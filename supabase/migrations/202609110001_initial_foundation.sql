create extension if not exists pgcrypto;

create type public.app_role as enum ('cashier', 'manager');
create type public.order_status as enum ('open', 'paid', 'void', 'refunded');
create type public.receipt_mode as enum ('shop', 'field');
create type public.payment_method as enum ('cash', 'transfer');
create type public.print_status as enum ('pending', 'printed', 'failed');
create type public.discount_type as enum ('none', 'percent', 'fixed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'cashier',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.store_settings (
  singleton boolean primary key default true check (singleton),
  store_name text not null,
  social_contact text,
  phone text,
  receipt_footer text,
  payment_qr_path text,
  bank_payment_label text,
  bank_account_name text,
  bank_account_number text,
  bank_reference text,
  timezone text not null default 'Asia/Bangkok',
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  sku text unique,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  table_number text not null unique,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  table_id uuid references public.dining_tables(id),
  status public.order_status not null default 'open',
  receipt_mode public.receipt_mode not null default 'shop',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_type public.discount_type not null default 'none',
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  discount_reason text,
  discount_applied_by uuid references public.profiles(id),
  total numeric(12,2) not null default 0 check (total >= 0),
  opened_by uuid not null references public.profiles(id),
  closed_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  void_reason text,
  check (discount <= subtotal),
  check (
    (discount_type = 'none' and discount_value = 0 and discount = 0 and discount_reason is null and discount_applied_by is null)
    or (discount_type = 'percent' and discount_value > 0 and discount_value <= 100 and discount > 0
      and length(btrim(coalesce(discount_reason, ''))) > 0 and discount_applied_by is not null)
    or (discount_type = 'fixed' and discount_value > 0 and discount = discount_value
      and length(btrim(coalesce(discount_reason, ''))) > 0 and discount_applied_by is not null)
  ),
  check (status <> 'void' or length(btrim(coalesce(void_reason, ''))) > 0),
  check ((status = 'open' and closed_at is null and closed_by is null)
      or (status <> 'open' and closed_at is not null and closed_by is not null))
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity numeric(12,3) not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  method public.payment_method not null,
  amount numeric(12,2) not null check (amount > 0),
  received_amount numeric(12,2) not null check (received_amount >= amount),
  change_amount numeric(12,2) not null default 0 check (change_amount >= 0),
  paid_at timestamptz not null default now(),
  received_by uuid not null references public.profiles(id),
  transfer_reference text,
  check ((method = 'cash' and change_amount = received_amount - amount)
      or (method = 'transfer' and received_amount = amount and change_amount = 0))
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_id uuid not null references public.payments(id),
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  reason text not null check (length(btrim(reason)) > 0),
  refunded_by uuid not null references public.profiles(id),
  refunded_at timestamptz not null default now(),
  unique (order_id)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  print_number integer not null default 1 check (print_number > 0),
  mode public.receipt_mode not null,
  payload jsonb not null,
  print_status public.print_status not null default 'pending',
  print_attempts integer not null default 0 check (print_attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  printed_at timestamptz,
  unique (order_id, print_number)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index orders_status_opened_at_idx on public.orders(status, opened_at);
create index orders_opened_by_idx on public.orders(opened_by, opened_at);
create index orders_closed_at_idx on public.orders(closed_at);
create index order_items_order_id_idx on public.order_items(order_id);
create index receipts_order_id_idx on public.receipts(order_id);
create index refunds_order_id_idx on public.refunds(order_id);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), 'ผู้ใช้งาน'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select public.current_user_role() = 'manager'), false);
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.is_manager() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_manager() to authenticated;

insert into public.store_settings (singleton, store_name)
values (true, 'กรุณาตั้งชื่อร้าน');

insert into public.dining_tables (table_number, display_name)
select number::text, 'โต๊ะ ' || number::text
from generate_series(1, 20) as number;

revoke all on table public.profiles, public.store_settings, public.categories, public.products,
  public.dining_tables, public.orders, public.order_items, public.payments, public.refunds,
  public.receipts, public.audit_events from anon, authenticated;

grant select on public.profiles, public.store_settings, public.categories, public.products,
  public.dining_tables, public.orders, public.order_items, public.payments, public.refunds,
  public.receipts, public.audit_events to authenticated;
grant insert, update, delete on public.store_settings, public.categories, public.products,
  public.dining_tables to authenticated;

alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.dining_tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.receipts enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles: read own or manager" on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.is_manager()));
create policy "store settings: read authenticated" on public.store_settings for select to authenticated using (true);
create policy "store settings: manager update" on public.store_settings for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "categories: read active or manager" on public.categories for select to authenticated
  using (active or (select public.is_manager()));
create policy "categories: manager insert" on public.categories for insert to authenticated with check ((select public.is_manager()));
create policy "categories: manager update" on public.categories for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "categories: manager delete" on public.categories for delete to authenticated using ((select public.is_manager()));
create policy "products: read active or manager" on public.products for select to authenticated
  using (active or (select public.is_manager()));
create policy "products: manager insert" on public.products for insert to authenticated with check ((select public.is_manager()));
create policy "products: manager update" on public.products for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "products: manager delete" on public.products for delete to authenticated using ((select public.is_manager()));
create policy "tables: read active or manager" on public.dining_tables for select to authenticated
  using (active or (select public.is_manager()));
create policy "tables: manager insert" on public.dining_tables for insert to authenticated with check ((select public.is_manager()));
create policy "tables: manager update" on public.dining_tables for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "tables: manager delete" on public.dining_tables for delete to authenticated using ((select public.is_manager()));
create policy "orders: read own or manager" on public.orders for select to authenticated
  using (opened_by = auth.uid() or (select public.is_manager()));
create policy "order items: read own order or manager" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders where orders.id = order_items.order_id and (orders.opened_by = auth.uid() or (select public.is_manager()))));
create policy "payments: read own order or manager" on public.payments for select to authenticated
  using (exists (select 1 from public.orders where orders.id = payments.order_id and (orders.opened_by = auth.uid() or (select public.is_manager()))));
create policy "refunds: read own order or manager" on public.refunds for select to authenticated
  using (exists (select 1 from public.orders where orders.id = refunds.order_id and (orders.opened_by = auth.uid() or (select public.is_manager()))));
create policy "receipts: read own order or manager" on public.receipts for select to authenticated
  using (exists (select 1 from public.orders where orders.id = receipts.order_id and (orders.opened_by = auth.uid() or (select public.is_manager()))));
create policy "audit events: read own or manager" on public.audit_events for select to authenticated
  using (actor_id = auth.uid() or (select public.is_manager()));

comment on table public.orders is 'Client writes are intentionally denied. Phase 2 adds security definer RPCs for order changes and checkout.';
comment on table public.store_settings is 'Only managers can update payment and receipt settings; receipts retain a snapshot at payment time.';
