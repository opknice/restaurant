-- The sales workspace loads the active catalog once and filters it locally.
-- This index is therefore not used by a database query and should not be kept.
drop index if exists public.products_active_favorites_by_category_idx;
