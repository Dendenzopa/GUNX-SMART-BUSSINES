-- GUNX SMART BUSINESS: customer debt ledger and append-only repayments.
create table if not exists public.debts (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete restrict,
 description text,
 original_amount numeric(14,2) not null check(original_amount > 0),
 balance numeric(14,2) not null check(balance >= 0 and balance <= original_amount),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.debt_payments (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 debt_id uuid not null references public.debts(id) on delete restrict,
 amount numeric(14,2) not null check(amount > 0),
 method text not null check(method in ('cash','mobile_money','bank')),
 note text,
 received_by uuid references auth.users(id),
 received_at timestamptz not null default now()
);
create index if not exists debts_shop_balance_idx on public.debts(shop_id,balance) where balance > 0;
create index if not exists debt_payments_debt_date_idx on public.debt_payments(debt_id,received_at desc);
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
drop policy if exists debts_member_select on public.debts;
create policy debts_member_select on public.debts for select to authenticated using(public.is_shop_member(shop_id));
drop policy if exists debt_payments_member_select on public.debt_payments;
create policy debt_payments_member_select on public.debt_payments for select to authenticated using(public.is_shop_member(shop_id));

create or replace function public.create_manual_debt(p_shop_id uuid,p_customer_name text,p_amount numeric,p_description text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_customer_id uuid; v_debt_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.has_shop_role(p_shop_id,array['owner','manager','cashier']) then raise exception 'Not permitted'; end if;
 if p_customer_name is null or length(trim(p_customer_name))<2 or length(trim(p_customer_name))>120 then raise exception 'Customer name must be 2-120 characters'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Debt amount must be positive'; end if;
 insert into public.customers(shop_id,name) values(p_shop_id,trim(p_customer_name)) returning id into v_customer_id;
 insert into public.debts(shop_id,customer_id,description,original_amount,balance,created_by)
 values(p_shop_id,v_customer_id,nullif(trim(coalesce(p_description,'')),''),round(p_amount,2),round(p_amount,2),auth.uid()) returning id into v_debt_id;
 return v_debt_id;
end; $$;
revoke all on function public.create_manual_debt(uuid,text,numeric,text) from public;
grant execute on function public.create_manual_debt(uuid,text,numeric,text) to authenticated;

create or replace function public.record_debt_payment(p_debt_id uuid,p_amount numeric,p_method text default 'cash',p_note text default null)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare v_debt public.debts%rowtype; v_balance numeric(14,2);
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be positive'; end if;
 if p_method not in ('cash','mobile_money','bank') then raise exception 'Unsupported payment method'; end if;
 select * into v_debt from public.debts where id=p_debt_id for update;
 if not found then raise exception 'Debt not found'; end if;
 if not public.has_shop_role(v_debt.shop_id,array['owner','manager','cashier']) then raise exception 'Not permitted'; end if;
 if round(p_amount,2)>v_debt.balance then raise exception 'Payment exceeds outstanding balance'; end if;
 v_balance:=v_debt.balance-round(p_amount,2);
 insert into public.debt_payments(shop_id,debt_id,amount,method,note,received_by)
 values(v_debt.shop_id,v_debt.id,round(p_amount,2),p_method,nullif(trim(coalesce(p_note,'')),''),auth.uid());
 update public.debts set balance=v_balance where id=v_debt.id;
 return v_balance;
end; $$;
revoke all on function public.record_debt_payment(uuid,numeric,text,text) from public;
grant execute on function public.record_debt_payment(uuid,numeric,text,text) to authenticated;
