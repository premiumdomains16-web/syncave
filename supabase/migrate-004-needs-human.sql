-- "Needs a human reply": visitors can write to the team (or ask something the bot
-- can't answer); those conversations are flagged until the owner replies.
-- Run in the Supabase SQL editor on a project that already ran migrate-003-inbox.sql.
-- (Fresh projects: supabase/schema.sql already includes all of this.) Safe to re-run.

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

-- append_message gains p_to_team. The old 5-argument version is dropped first so calls stay unambiguous.
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

-- Recompute the counter from existing rows (all false on first run).
update public.bots b set needs_human_count = (select count(*) from public.conversations c where c.bot_id = b.id and c.needs_human);

grant all privileges on all functions in schema public to service_role;
