-- Permit the employee who uploaded a private document to record the successful upload.
-- View/download remain restricted to the document owner, business owner, or explicitly authorized manager.
BEGIN;
CREATE OR REPLACE FUNCTION public.log_employee_document_access(p_document_id uuid,p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_doc public.employee_private_documents%rowtype;
BEGIN
 IF auth.uid() IS NULL OR p_action NOT IN ('view','download','upload') THEN
  RAISE EXCEPTION 'Invalid document access request';
 END IF;
 SELECT * INTO v_doc FROM public.employee_private_documents WHERE id=p_document_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF p_action='upload' THEN
  IF v_doc.uploaded_by<>auth.uid() OR v_doc.user_id<>auth.uid() THEN
   RAISE EXCEPTION 'Not authorized to log this upload';
  END IF;
 ELSIF NOT (v_doc.user_id=auth.uid()
   OR public.has_shop_role(v_doc.shop_id,ARRAY['owner']::text[])
   OR public.has_shop_permission(v_doc.shop_id,'staff.documents.view')) THEN
  RAISE EXCEPTION 'Not authorized';
 END IF;
 INSERT INTO public.employee_document_access_logs(shop_id,document_id,accessed_by,action)
 VALUES(v_doc.shop_id,v_doc.id,auth.uid(),p_action);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.log_employee_document_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.log_employee_document_access(uuid,text) TO authenticated;
COMMIT;
