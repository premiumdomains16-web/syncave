-- Orders: delivery address column; phone becomes the main contact (email optional).
-- Run in the Supabase SQL editor after migrate-006. Safe to re-run.

alter table public.orders add column if not exists address text not null default '';

-- insert_order gains p_address. Drop the old 8-argument version first so calls stay unambiguous.
drop function if exists public.insert_order(text, text, text, text, text, text, timestamptz, integer);
create or replace function public.insert_order(
  p_bot_id text, p_id text, p_name text, p_email text, p_phone text, p_message text, p_created_at timestamptz, p_keep integer,
  p_address text default ''
) returns void language plpgsql as $$
begin
  insert into public.orders (id, bot_id, name, email, phone, message, address, created_at)
  values (p_id, p_bot_id, p_name, coalesce(p_email, ''), coalesce(p_phone, ''), coalesce(p_message, ''), coalesce(p_address, ''), coalesce(p_created_at, now()));
  if p_keep is not null then
    delete from public.orders
    where bot_id = p_bot_id
      and id in (
        select id from public.orders where bot_id = p_bot_id
        order by created_at desc, id desc offset p_keep
      );
  end if;
end $$;

grant all privileges on all functions in schema public to service_role;
