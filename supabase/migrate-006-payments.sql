-- Manual payments (InstaPay / Vodafone Cash). Run in the Supabase SQL editor after
-- migrate-005. Safe to re-run.

-- When a paid plan ends (it then counts as Free). null = no end date.
alter table public.users add column if not exists plan_expires_at timestamptz;

-- One row per "I paid" submission from the Billing page.
create table if not exists public.payment_requests (
  id          text primary key,
  user_id     text not null references public.users (id) on delete cascade,
  plan        text not null check (plan in ('starter', 'business')),
  period      text not null check (period in ('monthly', 'yearly')),
  amount_egp  integer not null check (amount_egp > 0),
  method      text not null check (method in ('instapay', 'vodafone_cash')),
  sender      text not null,
  reference   text not null,
  proof_path  text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists payment_requests_user_idx on public.payment_requests (user_id, created_at desc);
create index if not exists payment_requests_status_idx on public.payment_requests (status, created_at);
-- At most one pending request per customer.
create unique index if not exists payment_requests_one_pending_idx on public.payment_requests (user_id) where status = 'pending';

alter table public.payment_requests enable row level security;
grant all privileges on public.payment_requests to service_role;

-- Receipt screenshots: a PRIVATE bucket (they contain personal and financial details).
-- Only the API (service role) reads them, handing the admin short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update set public = false;
