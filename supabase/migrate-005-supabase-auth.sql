-- Move sign-in to Supabase Auth. Run in the Supabase SQL editor (after migrate-004).
-- Safe to re-run.
--
-- Accounts (public.users) stay: they own bots and carry the plan. Each is linked to
-- a Supabase Auth login through auth_id. Existing accounts are linked automatically
-- the first time someone signs in with the same, confirmed email address.

alter table public.users add column if not exists auth_id uuid unique;
alter table public.users alter column password_hash drop not null;

-- If a Supabase Auth user is deleted, unlink the account (its bots are kept).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_auth_id_fkey') then
    alter table public.users
      add constraint users_auth_id_fkey foreign key (auth_id) references auth.users (id) on delete set null;
  end if;
end $$;

-- Old cookie sessions are no longer used.
drop table if exists public.sessions;
