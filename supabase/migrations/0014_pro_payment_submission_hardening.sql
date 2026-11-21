-- GUNX PRO payment submission hardening.
-- Prevent accidental duplicate references that differ only by letter case/spacing.
-- Limit owner-submitted payment claims to five per rolling 24 hours per user.

create unique index if not exists pro_payment_requests_provider_reference_ci_uidx
  on public.pro_payment_requests (provider, lower(btrim(transaction_reference)));

create or replace function public.guard_pro_payment_submission_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Serialize concurrent submissions from the same user so parallel requests
  -- cannot bypass the daily allowance.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':pro-payment-submit', 0));

  select count(*) into v_recent_count
  from public.pro_payment_requests
  where submitted_by = v_user_id
    and submitted_at >= now() - interval '24 hours';

  if v_recent_count >= 5 then
    raise exception 'PAYMENT_SUBMISSION_RATE_LIMIT: You can submit up to 5 Pro payment references in 24 hours.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists pro_payment_submission_rate_guard on public.pro_payment_requests;
create trigger pro_payment_submission_rate_guard
before insert on public.pro_payment_requests
for each row execute function public.guard_pro_payment_submission_rate();

comment on function public.guard_pro_payment_submission_rate() is
'Limits authenticated owners to five GUNX PRO payment-reference submissions per rolling 24 hours.';

revoke all on function public.guard_pro_payment_submission_rate() from public, anon, authenticated;
