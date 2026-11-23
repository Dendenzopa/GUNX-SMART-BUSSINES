-- GUNX SMART BUSINESS: enforce company-group shop-link consent on every write path.
-- Shops have an owner UPDATE policy, so a trigger is required to stop direct
-- PostgREST updates from bypassing the group-link RPC authorization checks.

create or replace function public.guard_shop_company_group_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.company_group_id is not distinct from old.company_group_id then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required to change company-group association';
  end if;

  if not public.has_shop_role(old.id, array['owner']) then
    raise exception 'Only the shop owner may change its company-group association';
  end if;

  -- Moving directly between groups is deliberately forbidden. Unlink first,
  -- then link in a separate authorized operation.
  if old.company_group_id is not null and new.company_group_id is not null then
    raise exception 'Unlink the shop from its current group before linking another group';
  end if;

  if old.company_group_id is not null
     and not public.has_company_group_role(old.company_group_id,array['group_owner','group_admin']) then
    raise exception 'A group owner or administrator must authorize shop unlinking';
  end if;

  if new.company_group_id is not null
     and not public.has_company_group_role(new.company_group_id,array['group_owner','group_admin']) then
    raise exception 'A group owner or administrator must authorize shop linking';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_shop_company_group_change() from public, anon, authenticated;

drop trigger if exists shops_company_group_consent_guard on public.shops;
create trigger shops_company_group_consent_guard
before update of company_group_id on public.shops
for each row execute function public.guard_shop_company_group_change();

comment on function public.guard_shop_company_group_change() is
  'Enforces shop-owner and company-group-owner/admin consent even for direct shops table updates.';
