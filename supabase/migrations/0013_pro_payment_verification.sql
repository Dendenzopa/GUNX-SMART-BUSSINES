-- GUNX PRO payment requests and trusted manual verification.
-- This does NOT integrate directly with mobile-money provider APIs.
create table if not exists public.pro_payment_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  provider text not null check (provider in ('manual','mpesa','halopesa','mixx','airtel_money','bank')),
  amount_tzs integer not null default 5000 check (amount_tzs = 5000),
  transaction_reference text not null check (length(trim(transaction_reference)) between 4 and 120),
  payer_phone text,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  admin_note text,
  unique (provider, transaction_reference)
);

create index if not exists pro_payment_requests_shop_status_idx
  on public.pro_payment_requests(shop_id, status, submitted_at desc);

alter table public.pro_payment_requests enable row level security;
drop policy if exists pro_payment_requests_owner_read on public.pro_payment_requests;
create policy pro_payment_requests_owner_read on public.pro_payment_requests
for select to authenticated
using (public.has_shop_role(shop_id, array['owner']));

-- Owners can submit a reference, but cannot mark it verified or activate Pro.
create or replace function public.submit_pro_payment(
  p_shop_id uuid,
  p_provider text,
  p_transaction_reference text,
  p_payer_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner']) then
    raise exception 'Only the shop owner can submit a Pro payment';
  end if;
  if p_provider not in ('manual','mpesa','halopesa','mixx','airtel_money','bank') then
    raise exception 'Unsupported payment provider';
  end if;
  if p_transaction_reference is null or length(trim(p_transaction_reference)) not between 4 and 120 then
    raise exception 'A valid transaction reference is required';
  end if;
  if p_payer_phone is not null and length(trim(p_payer_phone)) > 32 then
    raise exception 'Invalid payer phone';
  end if;

  insert into public.pro_payment_requests(
    shop_id, submitted_by, provider, transaction_reference, payer_phone
  ) values (
    p_shop_id, auth.uid(), p_provider, trim(p_transaction_reference), nullif(trim(coalesce(p_payer_phone,'')), '')
  )
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'This payment reference has already been submitted';
end;
$$;

revoke all on function public.submit_pro_payment(uuid, text, text, text) from public;
grant execute on function public.submit_pro_payment(uuid, text, text, text) to authenticated;

-- Only a trusted server using the service-role key may execute this activation RPC.
create or replace function public.admin_activate_pro(
  p_payment_request_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.pro_payment_requests%rowtype;
  v_expires timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted server authorization required' using errcode = '42501';
  end if;

  select * into v_payment
  from public.pro_payment_requests
  where id = p_payment_request_id
  for update;

  if not found then raise exception 'Payment request not found'; end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment request is not pending (current status: %)', v_payment.status;
  end if;
  if v_payment.amount_tzs <> 5000 then raise exception 'Unexpected payment amount'; end if;

  select greatest(coalesce(expires_at, now()), now()) + interval '30 days'
    into v_expires
  from public.shop_subscriptions
  where shop_id = v_payment.shop_id;

  insert into public.shop_subscriptions(
    shop_id, plan_code, status, started_at, expires_at, provider, provider_reference, updated_at
  ) values (
    v_payment.shop_id, 'pro', 'active', now(), v_expires,
    v_payment.provider, v_payment.transaction_reference, now()
  )
  on conflict (shop_id) do update set
    plan_code = 'pro',
    status = 'active',
    started_at = case
      when public.shop_subscriptions.status = 'active'
       and public.shop_subscriptions.expires_at > now()
      then public.shop_subscriptions.started_at
      else now()
    end,
    expires_at = v_expires,
    provider = excluded.provider,
    provider_reference = excluded.provider_reference,
    updated_at = now();

  update public.pro_payment_requests
  set status = 'verified',
      verified_at = now(),
      admin_note = nullif(left(coalesce(p_admin_note,''), 500), '')
  where id = p_payment_request_id;

  return jsonb_build_object(
    'activated', true,
    'shop_id', v_payment.shop_id,
    'plan_code', 'pro',
    'expires_at', v_expires
  );
end;
$$;

revoke all on function public.admin_activate_pro(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_activate_pro(uuid, text) to service_role;

comment on table public.pro_payment_requests is
'Owner-submitted TZS 5,000 GUNX PRO payment references. References remain pending until trusted admin verification.';
