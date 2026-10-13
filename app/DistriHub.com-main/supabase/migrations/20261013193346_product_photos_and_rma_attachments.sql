BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('product-photos','product-photos',true,2097152,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;
CREATE POLICY product_photo_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='product-photos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY product_photo_select ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='product-photos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
-- Each replacement has a new UUID; saved photos cannot be overwritten through Storage.

CREATE FUNCTION partner_rma_private.guard_attachments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attachment jsonb;
BEGIN
 IF jsonb_typeof(COALESCE(NEW.attachments,'[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(NEW.attachments,'[]'::jsonb))>20 THEN RAISE EXCEPTION 'Limite de 20 anexos por devolucao'; END IF;
 IF TG_OP='UPDATE' AND NOT COALESCE(NEW.attachments,'[]'::jsonb) @> COALESCE(OLD.attachments,'[]'::jsonb) THEN RAISE EXCEPTION 'Anexos existentes devem permanecer no historico'; END IF;
 FOR attachment IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.attachments,'[]'::jsonb)) LOOP
  IF TG_OP='UPDATE' AND COALESCE(OLD.attachments,'[]'::jsonb) @> jsonb_build_array(attachment) THEN CONTINUE; END IF;
  IF attachment->>'kind' IS NULL OR attachment->>'kind' NOT IN ('before','after','defect') OR length(COALESCE(attachment->>'name',''))=0 OR length(attachment->>'name')>255
   OR (storage.foldername(attachment->>'path'))[1] IS DISTINCT FROM auth.uid()::text OR (storage.foldername(attachment->>'path'))[2] IS DISTINCT FROM NEW.id::text
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='rma-attachments' AND name=attachment->>'path') THEN RAISE EXCEPTION 'Anexo invalido ou arquivo fora da devolucao'; END IF;
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_rma_private.guard_attachments() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_rma_attachments BEFORE INSERT OR UPDATE OF attachments ON public.rma_requests_v2
 FOR EACH ROW EXECUTE FUNCTION partner_rma_private.guard_attachments();

CREATE FUNCTION public.add_partner_rma_attachment(p_rma_id uuid,p_kind text,p_name text,p_path text) RETURNS public.rma_requests_v2
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rma_requests_v2%ROWTYPE; op record; existing jsonb; attachment jsonb;
BEGIN
 PERFORM partner_subscription_private.require_actor('rma');
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
 SELECT * INTO r FROM public.rma_requests_v2 WHERE id=p_rma_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Devolucao nao encontrada'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(NULL,NULL,r.branch_id);
 IF op.company_id IS DISTINCT FROM r.user_id THEN RAISE EXCEPTION 'Devolucao fora da empresa'; END IF;
 attachment:=jsonb_build_object('kind',p_kind,'name',p_name,'path',p_path);
 SELECT value INTO existing FROM jsonb_array_elements(COALESCE(r.attachments,'[]'::jsonb)) WHERE value->>'path'=p_path;
 IF FOUND THEN
  IF existing IS DISTINCT FROM attachment THEN RAISE EXCEPTION 'Anexo ja registrado com outros dados'; END IF;
  RETURN r;
 END IF;
 UPDATE public.rma_requests_v2 SET attachments=COALESCE(attachments,'[]'::jsonb)||jsonb_build_array(attachment),updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.add_partner_rma_attachment(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_partner_rma_attachment(uuid,text,text,text) TO authenticated;
COMMIT;
