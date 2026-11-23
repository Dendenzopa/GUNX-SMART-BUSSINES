-- GUNX SMART BUSINESS: branch opening sessions and independently submitted daily closes.
alter table public.expenses
  add column if not exists payment_method text not null default 'cash';
alter table public.expenses
  drop constraint if exists expenses_payment_method_check;
alter table public.expenses
  add constraint expenses_payment_method_check
  check (payment_method in ('cash','mobile_money','bank'));

create table if not exists public.branch_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null,
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_cash numeric(14,2) not null default 0 check (opening_cash >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  constraint branch_cash_sessions_branch_fk foreign key (shop_id,branch_id)
    references public.branches(shop_id,id),
  constraint branch_cash_sessions_close_state check (
    (status = 'open' and closed_at is null and closed_by is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null)
  )
);

create unique index if not exists branch_one_open_cash_session
  on public.branch_cash_sessions(shop_id,branch_id) where status = 'open';
create index if not exists branch_cash_sessions_date_idx
  on public.branch_cash_sessions(shop_id,branch_id,opened_at desc);

create table if not exists public.branch_daily_closings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null,
  session_id uuid not null unique references public.branch_cash_sessions(id) on delete restrict,
  opened_by uuid not null references auth.users(id),
  closed_by uuid not null references auth.users(id),
  opened_at timestamptz not null,
  closed_at timestamptz not null default now(),
  opening_cash numeric(14,2) not null,
  cash_sales numeric(14,2) not null default 0,
  mobile_sales numeric(14,2) not null default 0,
  bank_sales numeric(14,2) not null default 0,
  cash_refunds numeric(14,2) not null default 0,
  cash_expenses numeric(14,2) not null default 0,
  expected_cash numeric(14,2) not null,
  counted_cash numeric(14,2) not null check (counted_cash >= 0),
  cash_difference numeric(14,2) not null,
  total_sales numeric(14,2) not null default 0,
  sales_count integer not null default 0,
  note text,
  review_status text not null default 'pending' check (review_status in ('pending','approved','needs_review')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  constraint branch_daily_closings_branch_fk foreign key (shop_id,branch_id)
    references public.branches(shop_id,id)
);

create index if not exists branch_daily_closings_date_idx
  on public.branch_daily_closings(shop_id,branch_id,closed_at desc);

alter table public.branch_cash_sessions enable row level security;
alter table public.branch_daily_closings enable row level security;

drop policy if exists branch_cash_sessions_select on public.branch_cash_sessions;
create policy branch_cash_sessions_select on public.branch_cash_sessions
for select to authenticated
using (
  public.has_branch_access(shop_id,branch_id)
  and (
    public.has_shop_role(shop_id,array['owner','manager'])
    or opened_by = (select auth.uid())
  )
);

drop policy if exists branch_daily_closings_select on public.branch_daily_closings;
create policy branch_daily_closings_select on public.branch_daily_closings
for select to authenticated
using (
  public.has_branch_access(shop_id,branch_id)
  and (
    public.has_shop_role(shop_id,array['owner','manager'])
    or opened_by = (select auth.uid())
    or closed_by = (select auth.uid())
  )
);

revoke all on public.branch_cash_sessions, public.branch_daily_closings from anon, authenticated;
grant select on public.branch_cash_sessions, public.branch_daily_closings to authenticated;

create or replace function public.open_branch_cash_session(
  p_shop_id uuid,
  p_branch_id uuid,
  p_opening_cash numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_opening_cash is null or p_opening_cash < 0 then raise exception 'Opening cash must be zero or greater'; end if;
  if not public.has_shop_role(p_shop_id,array['owner','manager','cashier'])
     or not public.has_branch_access(p_shop_id,p_branch_id) then
    raise exception 'Not permitted to open this branch';
  end if;
  insert into public.branch_cash_sessions(shop_id,branch_id,opened_by,opening_cash)
  values(p_shop_id,p_branch_id,auth.uid(),round(p_opening_cash,2))
  returning id into v_session_id;
  return v_session_id;
exception when unique_violation then
  raise exception 'This branch already has an open cash session. Close or review it first.';
end;
$$;
revoke all on function public.open_branch_cash_session(uuid,uuid,numeric) from public,anon;
grant execute on function public.open_branch_cash_session(uuid,uuid,numeric) to authenticated;

create or replace function public.close_branch_cash_session(
  p_session_id uuid,
  p_counted_cash numeric,
  p_note text default null
)
returns table(
  closing_id uuid,
  expected_cash numeric,
  counted_cash numeric,
  cash_difference numeric,
  total_sales numeric,
  sales_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.branch_cash_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_cash_sales numeric(14,2);
  v_mobile_sales numeric(14,2);
  v_bank_sales numeric(14,2);
  v_cash_refunds numeric(14,2);
  v_cash_expenses numeric(14,2);
  v_total_sales numeric(14,2);
  v_sales_count integer;
  v_expected numeric(14,2);
  v_closing_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Counted cash must be zero or greater'; end if;
  select * into v_session from public.branch_cash_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'open' then raise exception 'Open cash session not found'; end if;
  if not public.has_branch_access(v_session.shop_id,v_session.branch_id)
     or not (
       v_session.opened_by = auth.uid()
       or public.has_shop_role(v_session.shop_id,array['owner','manager'])
     ) then
    raise exception 'Not permitted to close this branch session';
  end if;

  select
    coalesce(sum(case when p.method='cash' then p.amount else 0 end),0),
    coalesce(sum(case when p.method='mobile_money' then p.amount else 0 end),0),
    coalesce(sum(case when p.method='bank' then p.amount else 0 end),0)
  into v_cash_sales,v_mobile_sales,v_bank_sales
  from public.payments p
  where p.shop_id=v_session.shop_id and p.branch_id=v_session.branch_id
    and p.received_at >= v_session.opened_at and p.received_at <= v_now;

  select coalesce(sum(r.refund_total),0) into v_cash_refunds
  from public.sale_refunds r
  where r.shop_id=v_session.shop_id and r.branch_id=v_session.branch_id
    and r.refund_method='cash' and r.created_at >= v_session.opened_at and r.created_at <= v_now;

  select coalesce(sum(e.amount),0) into v_cash_expenses
  from public.expenses e
  where e.shop_id=v_session.shop_id and e.branch_id=v_session.branch_id
    and e.payment_method='cash' and e.created_at >= v_session.opened_at and e.created_at <= v_now;

  select coalesce(sum(s.total),0), count(*)::integer
  into v_total_sales,v_sales_count
  from public.sales s
  where s.shop_id=v_session.shop_id and s.branch_id=v_session.branch_id
    and s.created_at >= v_session.opened_at and s.created_at <= v_now
    and s.status <> 'voided';

  v_expected := round(v_session.opening_cash + v_cash_sales - v_cash_refunds - v_cash_expenses,2);

  insert into public.branch_daily_closings(
    shop_id,branch_id,session_id,opened_by,closed_by,opened_at,closed_at,opening_cash,
    cash_sales,mobile_sales,bank_sales,cash_refunds,cash_expenses,expected_cash,
    counted_cash,cash_difference,total_sales,sales_count,note
  ) values (
    v_session.shop_id,v_session.branch_id,v_session.id,v_session.opened_by,auth.uid(),
    v_session.opened_at,v_now,v_session.opening_cash,v_cash_sales,v_mobile_sales,v_bank_sales,
    v_cash_refunds,v_cash_expenses,v_expected,round(p_counted_cash,2),
    round(p_counted_cash-v_expected,2),v_total_sales,v_sales_count,
    nullif(trim(coalesce(p_note,'')),'')
  ) returning id into v_closing_id;

  update public.branch_cash_sessions
  set status='closed',closed_at=v_now,closed_by=auth.uid()
  where id=v_session.id;

  return query select v_closing_id,v_expected,round(p_counted_cash,2),
    round(p_counted_cash-v_expected,2),v_total_sales,v_sales_count;
end;
$$;
revoke all on function public.close_branch_cash_session(uuid,numeric,text) from public,anon;
grant execute on function public.close_branch_cash_session(uuid,numeric,text) to authenticated;

create or replace function public.review_branch_daily_closing(
  p_closing_id uuid,
  p_review_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_shop_id uuid; v_branch_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_review_status not in ('approved','needs_review') then raise exception 'Invalid review status'; end if;
  select shop_id,branch_id into v_shop_id,v_branch_id
  from public.branch_daily_closings where id=p_closing_id for update;
  if not found then raise exception 'Daily closing not found'; end if;
  if not public.has_shop_role(v_shop_id,array['owner','manager'])
     or not public.has_branch_access(v_shop_id,v_branch_id) then
    raise exception 'Only authorized management may review this closing';
  end if;
  update public.branch_daily_closings
  set review_status=p_review_status,reviewed_by=auth.uid(),reviewed_at=now(),
      note=case when p_note is null or trim(p_note)='' then note else trim(p_note) end
  where id=p_closing_id;
end;
$$;
revoke all on function public.review_branch_daily_closing(uuid,text,text) from public,anon;
grant execute on function public.review_branch_daily_closing(uuid,text,text) to authenticated;

comment on table public.branch_cash_sessions is
'Independent branch opening sessions; only one open cash session is allowed per branch.';
comment on table public.branch_daily_closings is
'Immutable snapshot of expected versus counted cash and branch payment totals, submitted for management review.';
