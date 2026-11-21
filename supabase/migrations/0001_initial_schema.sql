-- GUNX SMART BUSINESS: initial multi-tenant PostgreSQL schema
-- Apply only to a new Supabase project after reviewing the deployment checklist.
create extension if not exists pgcrypto;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  currency text not null default 'TZS' check (currency = 'TZS'),
  timezone text not null default 'Africa/Dar_es_Salaam',
  created_at timestamptz not null default now()
);

create table if not exists public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','cashier','stockkeeper')),
  created_at timestamptz not null default now(),
  primary key (shop_id,user_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'piece',
  cost_price numeric(14,2) not null check (cost_price >= 0),
  selling_price numeric(14,2) not null check (selling_price >= 0),
  stock_quantity numeric(14,3) not null default 0 check (stock_quantity >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(shop_id,sku)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  receipt_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'completed' check (status in ('completed','partially_paid','refunded','voided')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(shop_id,receipt_number)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost_snapshot numeric(14,2) not null check (unit_cost_snapshot >= 0),
  line_total numeric(14,2) not null check (line_total >= 0)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  method text not null check (method in ('cash','mobile_money','bank','credit')),
  amount numeric(14,2) not null check (amount > 0),
  provider_reference text,
  received_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  description text not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('stock_in','sale','return','adjustment')),
  quantity_change numeric(14,3) not null check (quantity_change <> 0),
  reference_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.debt_repayments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','mobile_money','bank')),
  received_at timestamptz not null default now(),
  note text
);

create index if not exists products_shop_idx on public.products(shop_id);
create index if not exists sales_shop_date_idx on public.sales(shop_id,created_at desc);
create index if not exists expenses_shop_date_idx on public.expenses(shop_id,expense_date desc);
create index if not exists stock_movements_product_date_idx on public.stock_movements(product_id,created_at desc);
create index if not exists customers_shop_idx on public.customers(shop_id);

-- Enable RLS. Policies are deliberately not permissive defaults:
-- add membership/role-aware policies before exposing tables to client sessions.
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.debt_repayments enable row level security;
