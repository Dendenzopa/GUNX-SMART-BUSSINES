BEGIN;
CREATE TABLE public.employee_profiles (
 shop_id uuid NOT NULL, user_id uuid NOT NULL, legal_name text NOT NULL,
 phone_e164 text NOT NULL CHECK(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 identity_type text NOT NULL CHECK(identity_type IN ('nida','voter_id')),
 identity_number text NOT NULL, guarantor_name text, guarantor_phone text,
 guarantor_address text, origin_location text, current_address text,
 emergency_contact_name text, emergency_contact_phone text, job_title text,
 employment_start_date date, contract_path text, employee_photo_path text,
 declaration_accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(shop_id,user_id),
 FOREIGN KEY(shop_id,user_id) REFERENCES public.shop_members(shop_id,user_id) ON DELETE CASCADE,
 CHECK(length(trim(legal_name))>=3), CHECK(length(trim(identity_number))>=5)
);
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.employee_profiles TO authenticated;
CREATE POLICY employee_profiles_read ON public.employee_profiles FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'staff.documents.view'));
CREATE POLICY employee_profiles_insert ON public.employee_profiles FOR INSERT TO authenticated
 WITH CHECK(user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.shop_members sm WHERE sm.shop_id=employee_profiles.shop_id AND sm.user_id=(SELECT auth.uid()) AND sm.role IN ('manager','cashier','stockkeeper')));
CREATE POLICY employee_profiles_update ON public.employee_profiles FOR UPDATE TO authenticated
 USING(user_id=(SELECT auth.uid()) OR public.has_shop_role(shop_id,ARRAY['owner']::text[]))
 WITH CHECK(user_id=(SELECT auth.uid()) OR public.has_shop_role(shop_id,ARRAY['owner']::text[]));

CREATE TABLE public.employee_private_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, user_id uuid NOT NULL,
 document_type text NOT NULL CHECK(document_type IN ('identity','local_government_letter','guarantor_support','employment_contract','employee_photo')),
 storage_path text NOT NULL UNIQUE, uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,user_id) REFERENCES public.shop_members(shop_id,user_id) ON DELETE CASCADE,
 CHECK(storage_path LIKE shop_id::text || '/' || user_id::text || '/%')
);
ALTER TABLE public.employee_private_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_private_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.employee_private_documents TO authenticated;
CREATE POLICY employee_private_documents_read ON public.employee_private_documents FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'staff.documents.view'));
CREATE POLICY employee_private_documents_insert ON public.employee_private_documents FOR INSERT TO authenticated
 WITH CHECK(uploaded_by=(SELECT auth.uid()) AND user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.shop_members sm WHERE sm.shop_id=employee_private_documents.shop_id AND sm.user_id=(SELECT auth.uid()) AND sm.role IN ('manager','cashier','stockkeeper')));

CREATE TABLE public.employee_document_access_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES public.employee_private_documents(id) ON DELETE CASCADE,
 accessed_by uuid NOT NULL REFERENCES auth.users(id), action text NOT NULL CHECK(action IN ('view','download','upload')),
 accessed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_document_access_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_document_access_logs FROM PUBLIC,anon,authenticated;
CREATE POLICY employee_document_access_logs_owner_read ON public.employee_document_access_logs FOR SELECT TO authenticated
 USING(public.has_shop_role(shop_id,ARRAY['owner']::text[]));

CREATE OR REPLACE FUNCTION public.log_employee_document_access(p_document_id uuid,p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_doc public.employee_private_documents%rowtype;
BEGIN
 IF auth.uid() IS NULL OR p_action NOT IN ('view','download') THEN RAISE EXCEPTION 'Invalid document access request'; END IF;
 SELECT * INTO v_doc FROM public.employee_private_documents WHERE id=p_document_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF NOT (v_doc.user_id=auth.uid() OR public.has_shop_role(v_doc.shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(v_doc.shop_id,'staff.documents.view')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 INSERT INTO public.employee_document_access_logs(shop_id,document_id,accessed_by,action) VALUES(v_doc.shop_id,v_doc.id,auth.uid(),p_action);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.log_employee_document_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.log_employee_document_access(uuid,text) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('employee-private-documents','employee-private-documents',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

CREATE POLICY employee_private_documents_storage_select ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='employee-private-documents'
 AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
 AND (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
 AND ((storage.foldername(name))[2]=(SELECT auth.uid())::text
 OR public.has_shop_role(((storage.foldername(name))[1])::uuid,ARRAY['owner']::text[])
 OR public.has_shop_permission(((storage.foldername(name))[1])::uuid,'staff.documents.view')));
CREATE POLICY employee_private_documents_storage_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='employee-private-documents'
 AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
 AND (storage.foldername(name))[2]=(SELECT auth.uid())::text
 AND EXISTS(SELECT 1 FROM public.shop_members sm WHERE sm.shop_id=((storage.foldername(name))[1])::uuid AND sm.user_id=(SELECT auth.uid()) AND sm.role IN ('manager','cashier','stockkeeper')));
COMMIT;