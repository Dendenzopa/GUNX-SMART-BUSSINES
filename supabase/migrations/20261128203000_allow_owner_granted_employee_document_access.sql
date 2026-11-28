-- Add explicitly owner-granted permission for managers to view employee documents.
BEGIN;
CREATE OR REPLACE FUNCTION public.set_manager_permissions(p_shop_id uuid,p_user_id uuid,p_permissions text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_permission text;
DECLARE v_allowed constant text[] := ARRAY[
  'products.read','products.manage','pos.use','sales.view','payments.view','staff.documents.view',
  'customers.read','debts.manage','stock.manage','expenses.manage',
  'refunds.manage','reports.view','reports.profit','sync.manage'
];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_shop_role(p_shop_id,ARRAY['owner']::text[]) THEN
    RAISE EXCEPTION 'Only the business owner can assign manager permissions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id=p_shop_id AND user_id=p_user_id AND role='manager') THEN
    RAISE EXCEPTION 'Selected user is not a manager in this business';
  END IF;
  IF p_permissions IS NULL OR cardinality(p_permissions)>cardinality(v_allowed) THEN
    RAISE EXCEPTION 'Invalid permissions list';
  END IF;
  FOREACH v_permission IN ARRAY p_permissions LOOP
    IF NOT (v_permission=ANY(v_allowed)) THEN
      RAISE EXCEPTION 'Unsupported permission: %',v_permission;
    END IF;
  END LOOP;
  DELETE FROM public.shop_member_permissions WHERE shop_id=p_shop_id AND user_id=p_user_id;
  INSERT INTO public.shop_member_permissions(shop_id,user_id,permission,granted_by)
  SELECT p_shop_id,p_user_id,permission,auth.uid()
  FROM (SELECT DISTINCT unnest(coalesce(p_permissions,ARRAY[]::text[])) permission) q;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_manager_permissions(uuid,uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_manager_permissions(uuid,uuid,text[]) TO authenticated;
COMMIT;
