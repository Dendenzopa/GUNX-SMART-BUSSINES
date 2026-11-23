-- GUNX SMART BUSINESS: platform-owner payment review queue.
-- Platform admins may review owner-submitted payment references without exposing
-- service-role credentials or granting direct table write access to clients.

create or replace function public.get_platform_payment_requests(
  p_status text default 'pending',
  p_limit integer default 50
)
returns table (
  request_id uuid,
  shop_id uuid,
  shop_name text,
  submitted_by uuid,
  provider text,
  amount_tzs integer,
  transaction_reference text,
  payer_phone text,
  status text,
  submitted_at timestamptz,
  verified_at timestamptz,
  admin_note text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  if p_status not in ('pending','verified','rejected','all') then
    raise exception 'Invalid payment request status';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100';
  end if;

  return query
  select r.id, r.shop_id, s.name, r.submitted_by, r.provider, r.amount_tzs,
         r.transaction_reference, r.payer_phone, r.status, r.submitted_at,
         r.verified_at, r.admin_note
  from public.pro_payment_requests r
  join public.shops s on s.id = r.shop_id
  where p_status = 'all' or r.status = p_status
  order by case when r.status = 'pending' then 0 else 1 end, r.submitted_at desc
  limit p_limit;
end;
$$;

revoke all on function public.get_platform_payment_requests(text, integer) from public, anon;
grant execute on function public.get_platform_payment_requests(text, integer) to authenticated;

create or replace function public.review_platform_pro_payment(
  p_payment_request_id uuid,
  p_approve boolean,
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
  v_note text := nullif(left(trim(coalesce(p_admin_note,'')), 500), '');
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  if p_payment_request_id is null or p_approve is null then
    raise exception 'Payment request and decision are required';
  end if;

  select * into v_payment
  from public.pro_payment_requests
  where id = p_payment_request_id
  for update;

  if not found then raise exception 'Payment request not found'; end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment request is no longer pending (current status: %)', v_payment.status;
  end if;
  if v_payment.amount_tzs <> 5000 then raise exception 'Unexpected payment amount'; end if;

  if p_approve then
    select greatest(coalesce(expires_at, now()), now()) + interval '30 days'
      into v_expires
    from public.shop_subscriptions
    where shop_id = v_payment.shop_id;
    if not found then v_expires := now() + interval '30 days'; end if;

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
    set status = 'verified', verified_at = now(), admin_note = v_note
    where id = p_payment_request_id;

    return jsonb_build_object(
      'approved', true, 'shop_id', v_payment.shop_id,
      'plan_code', 'pro', 'expires_at', v_expires
    );
  end if;

  update public.pro_payment_requests
  set status = 'rejected', verified_at = now(), admin_note = v_note
  where id = p_payment_request_id;

  return jsonb_build_object('approved', false, 'shop_id', v_payment.shop_id);
end;
$$;

revoke all on function public.review_platform_pro_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_platform_pro_payment(uuid, boolean, text) to authenticated;

comment on function public.get_platform_payment_requests(text, integer) is
'Returns a bounded payment review queue only to trusted platform administrators.';
comment on function public.review_platform_pro_payment(uuid, boolean, text) is
'Approves or rejects one pending Pro payment only for trusted platform administrators; approval activates 30 days of Pro.';
