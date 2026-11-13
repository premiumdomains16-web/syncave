-- Upgrade an existing Syncave project from schema v1 (orders / unanswered stored as
-- JSON columns on bots) to v2 (own tables, counters, atomic functions).
-- Safe to run once; idempotent where possible. Run in the Supabase SQL editor.

-- 1. New tables.
create table if not exists public.orders (
  id         text primary key,
  bot_id     text not null references public.bots (id) on delete cascade,
  name       text not null,
  email      text not null,
  phone      text not null default '',
  message    text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists orders_bot_created_idx on public.orders (bot_id, created_at desc);

create table if not exists public.unanswered (
  id         text primary key,
  bot_id     text not null references public.bots (id) on delete cascade,
  question   text not null,
  key        text not null,
  count      integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  unique (bot_id, key)
);
create index if not exists unanswered_bot_rank_idx on public.unanswered (bot_id, count desc, last_seen desc);

-- 2. Counter columns on bots.
alter table public.bots add column if not exists order_count integer not null default 0;
alter table public.bots add column if not exists unanswered_count integer not null default 0;

-- 3. Copy existing JSON data into the new tables (only if the old columns still exist).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bots' and column_name = 'orders') then
    insert into public.orders (id, bot_id, name, email, phone, message, created_at)
    select o->>'id', b.id, coalesce(o->>'name', ''), coalesce(o->>'email', ''), coalesce(o->>'phone', ''), coalesce(o->>'message', ''),
           coalesce((o->>'timestamp')::timestamptz, now())
    from public.bots b, jsonb_array_elements(coalesce(b.orders, '[]'::jsonb)) as o
    where o->>'id' is not null
    on conflict (id) do nothing;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bots' and column_name = 'unanswered') then
    insert into public.unanswered (id, bot_id, question, key, count, first_seen, last_seen)
    select u->>'id', b.id, coalesce(u->>'question', ''), coalesce(u->>'key', ''), coalesce((u->>'count')::int, 1),
           coalesce((u->>'firstSeen')::timestamptz, now()), coalesce((u->>'lastSeen')::timestamptz, now())
    from public.bots b, jsonb_array_elements(coalesce(b.unanswered, '[]'::jsonb)) as u
    where u->>'id' is not null and coalesce(u->>'key', '') <> ''
    on conflict (bot_id, key) do nothing;
  end if;
end $$;

-- 4. Recompute counters from the copied rows.
update public.bots b set
  order_count      = (select count(*) from public.orders o where o.bot_id = b.id),
  unanswered_count = (select count(*) from public.unanswered u where u.bot_id = b.id);

-- 5. Drop the old JSON columns.
alter table public.bots drop column if exists orders;
alter table public.bots drop column if exists unanswered;

-- 6. Triggers that keep the counters current.
create or replace function public.bots_order_count_sync() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.bots set order_count = order_count + 1 where id = new.bot_id;
  elsif tg_op = 'DELETE' then
    update public.bots set order_count = greatest(order_count - 1, 0) where id = old.bot_id;
  end if;
  return null;
end $$;
drop trigger if exists orders_count_trg on public.orders;
create trigger orders_count_trg after insert or delete on public.orders
  for each row execute function public.bots_order_count_sync();

create or replace function public.bots_unanswered_count_sync() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.bots set unanswered_count = unanswered_count + 1 where id = new.bot_id;
  elsif tg_op = 'DELETE' then
    update public.bots set unanswered_count = greatest(unanswered_count - 1, 0) where id = old.bot_id;
  end if;
  return null;
end $$;
drop trigger if exists unanswered_count_trg on public.unanswered;
create trigger unanswered_count_trg after insert or delete on public.unanswered
  for each row execute function public.bots_unanswered_count_sync();

-- 7. Atomic write functions used by the widget.
create or replace function public.insert_order(
  p_bot_id text, p_id text, p_name text, p_email text, p_phone text, p_message text, p_created_at timestamptz, p_keep integer
) returns void language plpgsql as $$
begin
  insert into public.orders (id, bot_id, name, email, phone, message, created_at)
  values (p_id, p_bot_id, p_name, p_email, coalesce(p_phone, ''), coalesce(p_message, ''), coalesce(p_created_at, now()));
  if p_keep is not null then
    delete from public.orders
    where bot_id = p_bot_id
      and id in (
        select id from public.orders where bot_id = p_bot_id
        order by created_at desc, id desc offset p_keep
      );
  end if;
end $$;

create or replace function public.record_unanswered(
  p_bot_id text, p_id text, p_question text, p_key text, p_now timestamptz, p_cap integer
) returns void language plpgsql as $$
begin
  insert into public.unanswered (id, bot_id, question, key, count, first_seen, last_seen)
  values (p_id, p_bot_id, p_question, p_key, 1, p_now, p_now)
  on conflict (bot_id, key) do update
    set count = public.unanswered.count + 1, last_seen = excluded.last_seen;
  delete from public.unanswered
  where bot_id = p_bot_id
    and id in (
      select id from public.unanswered where bot_id = p_bot_id
      order by count desc, last_seen desc offset p_cap
    );
end $$;

-- 8. Security + grants for the new objects.
alter table public.orders     enable row level security;
alter table public.unanswered enable row level security;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
alter default privileges in schema public grant all on functions to service_role;
