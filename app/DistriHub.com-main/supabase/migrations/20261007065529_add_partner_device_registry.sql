CREATE TABLE public.partner_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 device_key uuid NOT NULL,
 branch_id uuid REFERENCES public.partner_branches(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 last_seen timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,device_key)
);
CREATE INDEX partner_devices_branch ON public.partner_devices(branch_id);
ALTER TABLE public.partner_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY devices_owner_read ON public.partner_devices FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.partner_devices FROM anon,authenticated;
GRANT SELECT ON public.partner_devices TO authenticated;
CREATE FUNCTION public.touch_partner_device(p_device_key uuid,p_name text,p_branch_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op record; v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_device_key IS NULL THEN RAISE EXCEPTION 'Sessao invalida'; END IF;
 SELECT * INTO v_op FROM public.resolve_partner_pdv_operator(NULL,NULL,p_branch_id);
 IF p_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=v_op.company_id)
 THEN RAISE EXCEPTION 'Filial invalida'; END IF;
 INSERT INTO public.partner_devices(user_id,device_key,branch_id,name)
 VALUES(v_op.company_id,p_device_key,COALESCE(p_branch_id,v_op.branch_id),trim(p_name))
 ON CONFLICT(user_id,device_key) DO UPDATE SET branch_id=EXCLUDED.branch_id,name=EXCLUDED.name,last_seen=pg_catalog.now()
 RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_partner_device(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.touch_partner_device(uuid,text,uuid) TO authenticated;
