-- Inbox: visitor conversations and messages, with owner replies.
-- Run in the Supabase SQL editor on a project that already has schema v2.
-- (Fresh projects: supabase/schema.sql already includes all of this.)

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
create or replace function public.bots_unread_count_sync() returns trigger language plpgsql as $$
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
end $$;
drop trigger if exists conversations_unread_trg on public.conversations;
create trigger conversations_unread_trg after insert or update of unread or delete on public.conversations
  for each row execute function public.bots_unread_count_sync();

-- Create the conversation if it's new, then keep at most p_keep per bot (oldest activity dropped).
create or replace function public.ensure_conversation(
  p_id text, p_bot_id text, p_visitor_id text, p_page_url text, p_now timestamptz, p_keep integer
) returns void language plpgsql as $$
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
end $$;

-- Append one message and update the conversation's summary + unread flag in one transaction.
create or replace function public.append_message(
  p_conversation_id text, p_id text, p_role text, p_text text, p_created_at timestamptz
) returns void language plpgsql as $$
begin
  insert into public.messages (id, conversation_id, role, text, created_at)
  values (p_id, p_conversation_id, p_role, p_text, coalesce(p_created_at, now()))
  on conflict (id) do nothing;
  if found then
    update public.conversations set
      last_message    = left(p_text, 200),
      last_message_at = greatest(last_message_at, coalesce(p_created_at, now())),
      message_count   = message_count + 1,
      unread          = case when p_role = 'visitor' then true when p_role = 'owner' then false else unread end
    where id = p_conversation_id;
  end if;
end $$;

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
