-- ------------------------------------------------------------
-- Admin auth — one-time codes (login OTP + password reset)
-- ------------------------------------------------------------
-- Backs the admin portal's email OTP (2nd factor after email+password) and the
-- "forgot password" reset link. Codes are stored HASHED (sha-256), short-lived,
-- single-use and rate-limited. Written/read ONLY by the service-role server
-- (RLS enabled with no policies → no anon/auth access).

create table if not exists auth_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  purpose     text not null check (purpose in ('login', 'reset')),
  expires_at  timestamptz not null,
  consumed    boolean not null default false,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_auth_codes_lookup on auth_codes (lower(email), purpose, created_at desc);

alter table auth_codes enable row level security;
-- (no policies on purpose — only the service role, which bypasses RLS, touches this)

-- Best-effort cleanup of stale codes whenever a new one is inserted.
create or replace function prune_auth_codes() returns trigger language plpgsql as $$
begin
  delete from auth_codes where expires_at < now() - interval '1 day';
  return new;
end;
$$;

drop trigger if exists trg_prune_auth_codes on auth_codes;
create trigger trg_prune_auth_codes after insert on auth_codes
  for each statement execute function prune_auth_codes();
