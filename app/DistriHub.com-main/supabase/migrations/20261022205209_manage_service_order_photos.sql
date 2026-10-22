-- Keep table writes behind the same branch/subscription authorization as OS uploads.
CREATE FUNCTION partner_operations_private.manage_service_order_photo(
 p_order_id uuid, p_photo_id uuid, p_expected_path text, p_new_path text, p_new_label text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o public.service_orders%ROWTYPE; photo public.service_order_photos%ROWTYPE;
BEGIN
 SELECT * INTO o FROM public.service_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF o.user_id IS DISTINCT FROM partner_operations_private.authorize_branch(o.branch_id,'os') THEN
  RAISE EXCEPTION 'OS não autorizada.';
 END IF;
 IF o.status='cancelada' THEN RAISE EXCEPTION 'Não é possível alterar fotos de uma OS cancelada.'; END IF;
 IF p_photo_id IS NULL OR nullif(p_expected_path,'') IS NULL THEN RAISE EXCEPTION 'Foto inválida.'; END IF;
 SELECT * INTO photo FROM public.service_order_photos WHERE id=p_photo_id AND service_order_id=o.id FOR UPDATE;
 IF NOT FOUND THEN
  IF p_new_path IS NULL THEN RETURN true; END IF;
  RAISE EXCEPTION 'Foto não encontrada. Recarregue os detalhes da OS.';
 END IF;
 IF photo.user_id IS DISTINCT FROM o.user_id OR photo.branch_id IS DISTINCT FROM o.branch_id THEN RAISE EXCEPTION 'Foto não autorizada.'; END IF;
 -- An identical replacement is a safe retry after an uncertain network response.
 IF p_new_path IS NOT NULL AND photo.storage_path=p_new_path THEN RETURN true; END IF;
 IF photo.storage_path IS DISTINCT FROM p_expected_path THEN RAISE EXCEPTION 'Esta foto foi alterada. Recarregue os detalhes da OS.'; END IF;
 IF p_new_path IS NULL THEN
  DELETE FROM public.service_order_photos WHERE id=photo.id;
 ELSE
  IF p_new_path=p_expected_path OR NOT partner_operations_private.can_access_os_file(p_new_path)
    OR split_part(p_new_path,'/',1)<>o.user_id::text OR split_part(p_new_path,'/',2)<>o.id::text
    OR EXISTS(SELECT 1 FROM public.service_order_photos WHERE storage_path=p_new_path AND id<>photo.id)
    OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='service-order-photos' AND name=p_new_path)
  THEN RAISE EXCEPTION 'Envie a nova foto antes de substituir a atual.'; END IF;
  UPDATE public.service_order_photos SET storage_path=p_new_path,label=left(coalesce(nullif(trim(p_new_label),''),label),200) WHERE id=photo.id;
 END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION partner_operations_private.manage_service_order_photo(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_operations_private.manage_service_order_photo(uuid,uuid,text,text,text) TO authenticated;

CREATE FUNCTION public.manage_service_order_photo(p_order_id uuid,p_photo_id uuid,p_expected_path text,p_new_path text DEFAULT NULL,p_new_label text DEFAULT NULL)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT partner_operations_private.manage_service_order_photo(p_order_id,p_photo_id,p_expected_path,p_new_path,p_new_label)
$fn$;
REVOKE ALL ON FUNCTION public.manage_service_order_photo(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_service_order_photo(uuid,uuid,text,text,text) TO authenticated;

-- Physical cleanup goes through Storage API, only after the old file is unlinked.
CREATE POLICY os_attachment_delete_unlinked ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='service-order-photos' AND partner_operations_private.can_access_os_file(name)
 AND NOT EXISTS(SELECT 1 FROM public.service_order_photos WHERE storage_path=name));
