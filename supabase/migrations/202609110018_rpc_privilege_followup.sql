-- Phase 10.1: PostgreSQL gives newly-created functions PUBLIC execute unless
-- it is revoked after creation. Close that inherited anon access explicitly.

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

-- Keep only the two bridge entry points available to the backend key.
revoke execute on function public.is_order_checkout_locked(uuid) from authenticated, service_role;
revoke execute on function public.protect_locked_order_items() from authenticated, service_role;
revoke execute on function public.protect_locked_order_totals() from authenticated, service_role;
revoke execute on function public.recalculate_order_totals(uuid) from authenticated, service_role;
revoke execute on function public.recalculate_order_correction(uuid) from authenticated, service_role;
revoke execute on function public.require_active_user() from authenticated, service_role;
revoke execute on function public.require_order_access(uuid, boolean) from authenticated, service_role;
revoke execute on function public.handle_new_user() from authenticated, service_role;
revoke execute on function public.set_order_item_category_snapshot() from authenticated, service_role;
revoke execute on function public.set_updated_at() from authenticated, service_role;

grant execute on function public.bridge_claim_next_receipt(text) to service_role;
grant execute on function public.bridge_complete_receipt_print(uuid, uuid, boolean, text, boolean) to service_role;
