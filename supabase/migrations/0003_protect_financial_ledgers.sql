-- Keep financial and stock ledgers append-only for authenticated clients.
-- Corrections should be represented by compensating transactions, not destructive edits.
do $$
declare t text;
begin
  foreach t in array array['sales','payments','stock_movements','debt_repayments','sale_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_delete', t);
  end loop;
end $$;
