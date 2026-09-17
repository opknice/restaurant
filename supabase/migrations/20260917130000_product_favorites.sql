-- Shared, manager-controlled favorites for the POS quick-access section.
-- Existing product RLS policies already restrict updates to managers.
alter table public.products
  add column if not exists is_favorite boolean not null default false;

comment on column public.products.is_favorite is
  'Shared POS favorite flag. Managers control this value; active favorites are shown first in the sales catalog.';
