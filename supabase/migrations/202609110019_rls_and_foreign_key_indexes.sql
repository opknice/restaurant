-- Phase 10.2: evaluate auth context once per statement and cover foreign keys.

drop policy if exists "profiles: read own or manager" on public.profiles;
create policy "profiles: read own or manager" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.is_manager()));

drop policy if exists "orders: read active own or manager" on public.orders;
create policy "orders: read active own or manager" on public.orders
for select to authenticated
using ((select public.is_active_user()) and (
  opened_by = (select auth.uid()) or (select public.is_manager())
));

drop policy if exists "order items: read active own order or manager" on public.order_items;
create policy "order items: read active own order or manager" on public.order_items
for select to authenticated
using ((select public.is_active_user()) and exists (
  select 1 from public.orders o
  where o.id = order_items.order_id
    and (o.opened_by = (select auth.uid()) or (select public.is_manager()))
));

drop policy if exists "payments: read active own order or manager" on public.payments;
create policy "payments: read active own order or manager" on public.payments
for select to authenticated
using ((select public.is_active_user()) and exists (
  select 1 from public.orders o
  where o.id = payments.order_id
    and (o.opened_by = (select auth.uid()) or (select public.is_manager()))
));

drop policy if exists "refunds: read active own order or manager" on public.refunds;
create policy "refunds: read active own order or manager" on public.refunds
for select to authenticated
using ((select public.is_active_user()) and exists (
  select 1 from public.orders o
  where o.id = refunds.order_id
    and (o.opened_by = (select auth.uid()) or (select public.is_manager()))
));

drop policy if exists "receipts: read active own order or manager" on public.receipts;
create policy "receipts: read active own order or manager" on public.receipts
for select to authenticated
using ((select public.is_active_user()) and exists (
  select 1 from public.orders o
  where o.id = receipts.order_id
    and (o.opened_by = (select auth.uid()) or (select public.is_manager()))
));

drop policy if exists "audit events: read active own or manager" on public.audit_events;
create policy "audit events: read active own or manager" on public.audit_events
for select to authenticated
using ((select public.is_active_user()) and (
  actor_id = (select auth.uid()) or (select public.is_manager())
));

create index if not exists audit_events_actor_id_idx on public.audit_events(actor_id);
create index if not exists expenses_created_by_idx on public.expenses(created_by);
create index if not exists expenses_voided_by_idx on public.expenses(voided_by);
create index if not exists order_correction_items_product_id_idx on public.order_correction_items(product_id);
create index if not exists order_corrections_cancelled_by_idx on public.order_corrections(cancelled_by);
create index if not exists order_corrections_created_by_idx on public.order_corrections(created_by);
create index if not exists order_corrections_finalized_by_idx on public.order_corrections(finalized_by);
create index if not exists order_corrections_replacement_order_id_idx on public.order_corrections(replacement_order_id);
create index if not exists order_corrections_table_id_idx on public.order_corrections(table_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists orders_closed_by_idx on public.orders(closed_by);
create index if not exists orders_discount_applied_by_idx on public.orders(discount_applied_by);
create index if not exists orders_root_order_id_idx on public.orders(root_order_id);
create index if not exists orders_superseded_by_order_id_idx on public.orders(superseded_by_order_id);
create index if not exists payments_received_by_idx on public.payments(received_by);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists receipts_print_requested_by_idx on public.receipts(print_requested_by);
create index if not exists receipts_reviewed_by_idx on public.receipts(reviewed_by);
create index if not exists receipts_supersedes_receipt_id_idx on public.receipts(supersedes_receipt_id);
create index if not exists refunds_payment_id_idx on public.refunds(payment_id);
create index if not exists refunds_refunded_by_idx on public.refunds(refunded_by);
