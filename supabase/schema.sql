-- Syncave schema for Supabase (Postgres) — FRESH PROJECTS.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Already have the first version (orders/unanswered as JSON on bots)? Run
-- supabase/migrate-002-orders-unanswered.sql instead.
--
-- The API (Edge Function "api") talks to these tables with the service-role key, so Row
-- Level Security is enabled with no policies: the anon/publishable key can read nothing.

-- Accounts: own bots and carry the plan. Sign-in is Supabase Auth; auth_id links the two.
create table if not exists public.users (
  id             text primary key,
  auth_id        uuid unique references auth.users (id) on delete set null,
  name           text not null,
  email          text not null unique,
  plan           text not null default 'free' check (plan in ('free', 'starter', 'business', 'agency')),
  requested_plan text check (requested_plan in ('starter', 'business', 'agency')),
  password_hash  text,
  created_at     timestamptz not null default now()
);

create table if not exists public.bots (
  id                   text primary key,
  owner_id             text references public.users (id) on delete cascade,
  name                 text not null,
  url                  text not null,
  template_id          text,
  welcome_message      text not null,
  fallback_message     text not null,
  theme_color          text not null default '#1f33d6',
  logo_url             text,
  background_image_url text,
  enable_orders        boolean not null default false,
  qa                   jsonb not null default '[]'::jsonb,
  published            jsonb,
  last_published       timestamptz,
  last_updated         timestamptz not null default now(),
  verified             boolean not null default false,
  verification_token   text not null,
  -- Derived counters, maintained by triggers below (never written by the app).
  order_count          integer not null default 0,
  unanswered_count     integer not null default 0
);
create index if not exists bots_owner_id_idx on public.bots (owner_id);

-- One row per order submitted through the chat widget.
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

-- Distinct visitor questions that hit the fallback, per bot (grouped by spelling-insensitive key).
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

-- Anonymized unanswered questions across all sites (the dialect-layer corpus).
create table if not exists public.unanswered_global (
  id       bigserial primary key,
  day      date not null,
  lang     text not null check (lang in ('ar', 'en')),
  industry text not null,
  question text not null
);
create index if not exists unanswered_global_day_idx on public.unanswered_global (day);

-- ---------- counters ----------

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

-- ---------- atomic write paths used by the widget ----------

-- Insert an order and, when p_keep is set, drop the oldest beyond that many for the bot.
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

-- Count a fallback hit: bump the matching question or add it, then keep at most p_cap entries.
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

-- ---------- inbox: conversations + messages ----------

create table if not exists public.conversations (
  id              text primary key,
  bot_id          text not null references public.bots (id) on delete cascade,
  visitor_id      text not null,
  page_url        text not null default '',
  started_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message    text not null default '',
  message_count   integer not null default 0,
  unread          boolean not null default false
);
create index if not exists conversations_bot_last_idx on public.conversations (bot_id, last_message_at desc);

create table if not exists public.messages (
  id              text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('visitor', 'bot', 'owner')),
  text            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at);

alter table public.bots add column if not exists unread_count integer not null default 0;

-- Keep bots.unread_count = number of conversations with unread = true.
create or replace function public.bots_unread_count_sync() returns trigger language plpgsql as $
begin
  if tg_op = 'INSERT' then
    if new.unread then update public.bots set unread_count = unread_count + 1 where id = new.bot_id; end if;
  elsif tg_op = 'DELETE' then
    if old.unread then update public.bots set unread_count = greatest(unread_count - 1, 0) where id = old.bot_id; end if;
  elsif tg_op = 'UPDATE' then
    if old.unread and not new.unread then update public.bots set unread_count = greatest(unread_count - 1, 0) where id = new.bot_id;
    elsif new.unread and not old.unread then update public.bots set unread_count = unread_count + 1 where id = new.bot_id; end if;
  end if;
  return null;
end $;
drop trigger if exists conversations_unread_trg on public.conversations;
create trigger conversations_unread_trg after insert or update of unread or delete on public.conversations
  for each row execute function public.bots_unread_count_sync();

-- Create the conversation if it's new, then keep at most p_keep per bot (oldest activity dropped).
create or replace function public.ensure_conversation(
  p_id text, p_bot_id text, p_visitor_id text, p_page_url text, p_now timestamptz, p_keep integer
) returns void language plpgsql as $
begin
  insert into public.conversations (id, bot_id, visitor_id, page_url, started_at, last_message_at)
  values (p_id, p_bot_id, p_visitor_id, coalesce(p_page_url, ''), p_now, p_now)
  on conflict (id) do nothing;
  if p_keep is not null then
    delete from public.conversations
    where bot_id = p_bot_id
      and id in (
        select id from public.conversations where bot_id = p_bot_id
        order by last_message_at desc, id desc offset p_keep
      );
  end if;
end $;

-- ---------- needs a human reply (see migrate-004-needs-human.sql) ----------
alter table public.messages      add column if not exists to_team boolean not null default false;
alter table public.conversations add column if not exists needs_human boolean not null default false;
alter table public.bots          add column if not exists needs_human_count integer not null default 0;
create index if not exists conversations_bot_needs_human_idx on public.conversations (bot_id) where needs_human;

-- Keep bots.needs_human_count = number of conversations with needs_human = true.
create or replace function public.bots_needs_human_count_sync() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.needs_human then update public.bots set needs_human_count = needs_human_count + 1 where id = new.bot_id; end if;
  elsif tg_op = 'DELETE' then
    if old.needs_human then update public.bots set needs_human_count = greatest(needs_human_count - 1, 0) where id = old.bot_id; end if;
  elsif tg_op = 'UPDATE' then
    if old.needs_human and not new.needs_human then update public.bots set needs_human_count = greatest(needs_human_count - 1, 0) where id = new.bot_id;
    elsif new.needs_human and not old.needs_human then update public.bots set needs_human_count = needs_human_count + 1 where id = new.bot_id; end if;
  end if;
  return null;
end $$;
drop trigger if exists conversations_needs_human_trg on public.conversations;
create trigger conversations_needs_human_trg after insert or update of needs_human or delete on public.conversations
  for each row execute function public.bots_needs_human_count_sync();

-- Append one message and update the conversation summary, unread and needs-human flags in one transaction.
drop function if exists public.append_message(text, text, text, text, timestamptz);
create or replace function public.append_message(
  p_conversation_id text, p_id text, p_role text, p_text text, p_created_at timestamptz, p_to_team boolean default false
) returns void language plpgsql as $$
begin
  insert into public.messages (id, conversation_id, role, text, created_at, to_team)
  values (p_id, p_conversation_id, p_role, p_text, coalesce(p_created_at, now()), p_role = 'visitor' and coalesce(p_to_team, false))
  on conflict (id) do nothing;
  if found then
    update public.conversations set
      last_message    = left(p_text, 200),
      last_message_at = greatest(last_message_at, coalesce(p_created_at, now())),
      message_count   = message_count + 1,
      unread          = case when p_role = 'visitor' then true when p_role = 'owner' then false else unread end,
      needs_human     = case when p_role = 'visitor' and coalesce(p_to_team, false) then true when p_role = 'owner' then false else needs_human end
    where id = p_conversation_id;
  end if;
end $$;


-- ---------- security ----------

alter table public.users             enable row level security;
alter table public.bots              enable row level security;
alter table public.orders            enable row level security;
alter table public.unanswered        enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.unanswered_global enable row level security;

-- The server's key acts as the service_role; make sure it can use everything even on
-- projects where default privileges weren't applied to objects created in the SQL editor.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- Public bucket for bot logos and background images (served directly to the widget).
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists "uploads are publicly readable" on storage.objects;
create policy "uploads are publicly readable"
  on storage.objects for select
  using (bucket_id = 'uploads');
