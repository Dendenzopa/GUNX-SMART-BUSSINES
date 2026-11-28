-- GUNX account security audit events.
-- Repository migration only: do not apply to Production until backup/restore is verified.
begin;

create table if not exists public.account_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'all_sessions_revocation_requested',
      'all_sessions_revocation_succeeded',
      'all_sessions_revocation_failed'
    )
  ),
  created_at timestamptz not null default now()
);

create index if not exists account_security_events_user_created_idx
  on public.account_security_events (user_id, created_at desc);

alter table public.account_security_events enable row level security;

drop policy if exists account_security_events_select_own
  on public.account_security_events;

create policy account_security_events_select_own
  on public.account_security_events
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.account_security_events from anon, public;
revoke insert, update, delete on public.account_security_events from authenticated;
grant select on public.account_security_events to authenticated;
grant all on public.account_security_events to service_role;

commit;
