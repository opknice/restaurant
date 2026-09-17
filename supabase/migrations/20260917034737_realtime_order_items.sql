-- Phase 10: propagate item changes to other active POS screens.
-- FULL replica identity keeps order_id available for DELETE events.
alter table public.order_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end;
$$;
