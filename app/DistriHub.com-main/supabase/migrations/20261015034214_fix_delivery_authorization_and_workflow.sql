BEGIN;
CREATE SCHEMA partner_delivery_private;
REVOKE ALL ON SCHEMA partner_delivery_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA partner_delivery_private TO authenticated;
ALTER TABLE public.partner_sales ADD COLUMN delivery_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE partner_delivery_private.requests (
 actor_id uuid NOT NULL,request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE partner_delivery_private.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY no_direct_access ON partner_delivery_private.requests TO authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON partner_delivery_private.requests FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_delivery_private.delivery_only(old_row jsonb,new_row jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT old_row-ARRAY['delivery_status','delivery_driver_id','delivery_address','delivery_contact','delivery_details','delivery_history','delivery_revision']
  =new_row-ARRAY['delivery_status','delivery_driver_id','delivery_address','delivery_contact','delivery_details','delivery_history','delivery_revision']
$$;
REVOKE ALL ON FUNCTION partner_delivery_private.delivery_only(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
-- Only delivery-field updates use the delivery entitlement; all other writes
-- keep the original PDV checks, including branch quotas and identity checks.
DO $migration$
DECLARE name text; definition text;
BEGIN
 FOREACH name IN ARRAY ARRAY['guard_collaborator_write','guard_operational_write'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='partner_subscription_private' AND p.proname=name;
  IF position('TG_ARGV[0]' IN definition)=0 THEN RAISE EXCEPTION 'Write guard changed: %',name; END IF;
  definition:=replace(definition,'partner_subscription_private.'||name||'(', 'partner_delivery_private.'||name||'(');
  definition:=replace(definition,'TG_ARGV[0]', $feature$CASE WHEN TG_TABLE_NAME='partner_sales' AND TG_OP='UPDATE'
   AND partner_delivery_private.delivery_only(to_jsonb(OLD),to_jsonb(NEW)) THEN 'entregas' ELSE TG_ARGV[0] END$feature$);
  EXECUTE definition;
  EXECUTE format('REVOKE ALL ON FUNCTION partner_delivery_private.%I() FROM PUBLIC,anon,authenticated',name);
 END LOOP;
END $migration$;
DROP TRIGGER collaborator_module_write ON public.partner_sales;
CREATE TRIGGER collaborator_module_write BEFORE INSERT OR UPDATE OR DELETE ON public.partner_sales
FOR EACH ROW EXECUTE FUNCTION partner_delivery_private.guard_collaborator_write('pdv');
DROP TRIGGER saas_operational_access ON public.partner_sales;
CREATE TRIGGER saas_operational_access BEFORE INSERT OR UPDATE OR DELETE ON public.partner_sales
FOR EACH ROW EXECUTE FUNCTION partner_delivery_private.guard_operational_write('pdv');

CREATE FUNCTION partner_delivery_private.stamp_delivery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.delivery_revision:=0; RETURN NEW; END IF;
 IF ROW(NEW.delivery_status,NEW.delivery_driver_id,NEW.delivery_address,NEW.delivery_contact,NEW.delivery_details)
  IS DISTINCT FROM ROW(OLD.delivery_status,OLD.delivery_driver_id,OLD.delivery_address,OLD.delivery_contact,OLD.delivery_details) THEN
  IF OLD.status='concluida' AND auth.uid() IS NOT NULL AND current_setting('distrihub.checked_delivery',true) IS DISTINCT FROM NEW.id::text THEN
   RAISE EXCEPTION 'Atualize a entrega pela operação com revisão e confirmação';
  END IF;
  NEW.delivery_revision:=OLD.delivery_revision+1;
  NEW.delivery_history:=coalesce(OLD.delivery_history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
   'status',NEW.delivery_status,'driver_id',NEW.delivery_driver_id,'at',clock_timestamp(),'actor_id',auth.uid(),
   'address',NEW.delivery_address,'contact',NEW.delivery_contact,'details',NEW.delivery_details));
 ELSE NEW.delivery_revision:=OLD.delivery_revision; NEW.delivery_history:=OLD.delivery_history;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_delivery_private.stamp_delivery() FROM PUBLIC,anon,authenticated;
-- Runs after the existing snapshot trigger, preserving its cost/customer work.
CREATE TRIGGER zz_stamp_delivery BEFORE INSERT OR UPDATE ON public.partner_sales FOR EACH ROW EXECUTE FUNCTION partner_delivery_private.stamp_delivery();

CREATE FUNCTION partner_delivery_private.project_sale(s public.partner_sales) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',s.id,'user_id',s.user_id,'branch_id',s.branch_id,'sale_number',s.sale_number,
  'customer_id',s.customer_id,'customer_name',s.customer_name,'status',s.status,'delivery_type',s.delivery_type,
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('quantity',i->'quantity')) FROM jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) i),'[]'::jsonb),
  'total',s.total,'freight_fee',s.freight_fee,'delivery_status',s.delivery_status,'delivery_driver_id',s.delivery_driver_id,
  'delivery_address',s.delivery_address,'delivery_contact',s.delivery_contact,'delivery_details',s.delivery_details,
  'delivery_history',s.delivery_history,'delivery_revision',s.delivery_revision)
$$;
REVOKE ALL ON FUNCTION partner_delivery_private.project_sale(public.partner_sales) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_delivery_private.authorize(p_branch_id uuid,p_salesperson_id uuid,p_pin text)
RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record;
BEGIN
 PERFORM partner_subscription_private.require_actor('entregas');
 PERFORM partner_subscription_private.require_operator_module('entregas',p_salesperson_id);
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 IF op.role IS NULL OR op.role NOT IN ('administrador','gerente','logistica') THEN RAISE EXCEPTION 'Operador sem permissão para entregas'; END IF;
 IF p_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=op.company_id) THEN RAISE EXCEPTION 'Filial não autorizada'; END IF;
 RETURN QUERY SELECT op.company_id,op.salesperson_id,op.role,CASE WHEN op.role='administrador' THEN p_branch_id ELSE op.branch_id END;
END $$;
REVOKE ALL ON FUNCTION partner_delivery_private.authorize(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_delivery_private.read_deliveries(p_branch_id uuid,p_salesperson_id uuid,p_pin text,p_after uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; result jsonb;
BEGIN
 SELECT * INTO op FROM partner_delivery_private.authorize(p_branch_id,p_salesperson_id,p_pin);
 WITH page AS (SELECT s.* FROM public.partner_sales s WHERE s.user_id=op.company_id AND s.delivery_type='entrega' AND s.status='concluida'
  AND (op.branch_id IS NULL OR s.branch_id=op.branch_id) AND (op.role<>'logistica' OR s.delivery_driver_id=op.salesperson_id)
  AND (p_after IS NULL OR s.id>p_after) ORDER BY s.id LIMIT 100)
 SELECT jsonb_build_object('company_id',op.company_id,'sales',(SELECT coalesce(jsonb_agg(partner_delivery_private.project_sale(page::public.partner_sales) ORDER BY id),'[]'::jsonb) FROM page),
  'next_cursor',(SELECT CASE WHEN count(*)=100 THEN (array_agg(id ORDER BY id DESC))[1] ELSE NULL END FROM page),
  'drivers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.name,'role',sp.role,'active',sp.active,'branch_id',sp.branch_id) ORDER BY sp.name,sp.id),'[]'::jsonb)
   FROM public.partner_salespeople sp WHERE sp.user_id=op.company_id AND sp.role='logistica' AND sp.active=true
   AND (op.branch_id IS NULL OR sp.branch_id IS NULL OR sp.branch_id=op.branch_id) AND (op.role<>'logistica' OR sp.id=op.salesperson_id))) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION partner_delivery_private.read_deliveries(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_delivery_private.read_deliveries(uuid,uuid,text,uuid) TO authenticated;
CREATE FUNCTION public.read_partner_deliveries(p_branch_id uuid DEFAULT NULL,p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT partner_delivery_private.read_deliveries(p_branch_id,p_salesperson_id,p_pin,p_after) $$;
REVOKE ALL ON FUNCTION public.read_partner_deliveries(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_partner_deliveries(uuid,uuid,text,uuid) TO authenticated;

CREATE FUNCTION partner_delivery_private.mutate(p_request_id uuid,p_branch_id uuid,p_sale_id uuid,p_expected_revision bigint,p_patch jsonb,p_salesperson_id uuid,p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; s public.partner_sales%ROWTYPE; previous partner_delivery_private.requests%ROWTYPE;
 payload jsonb; result jsonb; target_status text; driver uuid; address text; contact text; details jsonb; field text;
BEGIN
 SELECT * INTO op FROM partner_delivery_private.authorize(p_branch_id,p_salesperson_id,p_pin);
 IF p_request_id IS NULL OR p_branch_id IS NULL OR p_sale_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'Identificação da entrega inválida'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR octet_length(p_patch::text)>16000
  OR EXISTS(SELECT 1 FROM jsonb_each(p_patch) WHERE key NOT IN ('status','driver_id','address','contact','scheduled_date','failure_reason','received_by','notes') OR jsonb_typeof(value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'Alterações de entrega inválidas'; END IF;
 payload:=jsonb_build_object('sale',p_sale_id,'branch',p_branch_id,'revision',p_expected_revision,'patch',p_patch,'operator',op.salesperson_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,54));
 SELECT * INTO previous FROM partner_delivery_private.requests WHERE actor_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
  IF previous.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Tentativa já utilizada com outros dados'; END IF;
  RETURN previous.result;
 END IF;
 SELECT * INTO s FROM public.partner_sales WHERE id=p_sale_id AND user_id=op.company_id AND branch_id=p_branch_id FOR UPDATE;
 IF NOT FOUND OR (op.branch_id IS NOT NULL AND s.branch_id IS DISTINCT FROM op.branch_id) THEN RAISE EXCEPTION 'Entrega não encontrada nesta empresa e filial'; END IF;
 IF op.role='logistica' AND (s.delivery_driver_id IS DISTINCT FROM op.salesperson_id OR p_patch ? 'driver_id' OR p_patch ? 'address' OR p_patch ? 'contact') THEN RAISE EXCEPTION 'Entregador só pode atualizar suas entregas e não pode reatribuir ou alterar o endereço'; END IF;
 IF s.delivery_type IS DISTINCT FROM 'entrega' OR s.status IS DISTINCT FROM 'concluida' THEN RAISE EXCEPTION 'Finalize a venda antes de expedir a entrega'; END IF;
 IF s.delivery_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Entrega atualizada por outra operação. Atualize a lista e reabra os detalhes'; END IF;
 target_status:=CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE s.delivery_status END;
 driver:=CASE WHEN p_patch ? 'driver_id' THEN (p_patch->>'driver_id')::uuid ELSE s.delivery_driver_id END;
 address:=CASE WHEN p_patch ? 'address' THEN nullif(btrim(p_patch->>'address'),'') ELSE s.delivery_address END;
 contact:=CASE WHEN p_patch ? 'contact' THEN nullif(btrim(p_patch->>'contact'),'') ELSE s.delivery_contact END;
 details:=coalesce(s.delivery_details,'{}'::jsonb);
 FOREACH field IN ARRAY ARRAY['scheduled_date','failure_reason','received_by','notes'] LOOP
  IF p_patch ? field THEN
   IF nullif(btrim(p_patch->>field),'') IS NULL THEN details:=details-field;
   ELSE details:=details||jsonb_build_object(field,btrim(p_patch->>field)); END IF;
  END IF;
 END LOOP;
 IF target_status IS DISTINCT FROM s.delivery_status THEN
  IF target_status<>'falhou' THEN details:=details-'failure_reason'; END IF;
  IF target_status<>'entregue' THEN details:=details-ARRAY['received_by','delivered_at']; END IF;
 END IF;
 IF target_status IS NULL OR target_status NOT IN ('pendente','em_rota','entregue','falhou') THEN RAISE EXCEPTION 'Status inválido'; END IF;
 IF s.delivery_status='entregue' AND (target_status<>'entregue' OR driver IS DISTINCT FROM s.delivery_driver_id) THEN RAISE EXCEPTION 'Entrega concluída não pode voltar à rota ou trocar de entregador'; END IF;
 IF target_status='entregue' AND s.delivery_status NOT IN ('em_rota','entregue') THEN RAISE EXCEPTION 'Coloque a entrega em rota antes de concluir'; END IF;
 IF driver IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople WHERE id=driver AND user_id=op.company_id AND role='logistica' AND active=true AND (branch_id IS NULL OR branch_id=p_branch_id)) THEN RAISE EXCEPTION 'Entregador inválido, inativo ou de outra filial'; END IF;
 IF target_status IN ('em_rota','entregue') AND (coalesce(length(btrim(address)),0)<5 OR driver IS NULL) THEN RAISE EXCEPTION 'Informe endereço e entregador antes de sair para entrega'; END IF;
 IF coalesce(length(address),0)>1500 OR coalesce(length(contact),0)>200 OR coalesce(length(details->>'notes'),0)>4000
  OR coalesce(length(details->>'received_by'),0)>200 OR coalesce(length(details->>'failure_reason'),0)>2000 THEN RAISE EXCEPTION 'Detalhes de entrega muito longos'; END IF;
 IF nullif(details->>'scheduled_date','') IS NOT NULL THEN PERFORM (details->>'scheduled_date')::date; END IF;
 IF target_status='falhou' AND nullif(btrim(details->>'failure_reason'),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da falha'; END IF;
 IF target_status='entregue' AND nullif(btrim(details->>'received_by'),'') IS NULL THEN RAISE EXCEPTION 'Informe quem recebeu a entrega'; END IF;
 IF target_status='entregue' THEN
  details:=details||jsonb_build_object('delivered_at',CASE WHEN s.delivery_status='entregue' THEN s.delivery_details->>'delivered_at' ELSE clock_timestamp()::text END);
 END IF;
 IF ROW(target_status,driver,address,contact,details) IS DISTINCT FROM ROW(s.delivery_status,s.delivery_driver_id,s.delivery_address,s.delivery_contact,s.delivery_details) THEN
  PERFORM set_config('distrihub.checked_delivery',s.id::text,true);
  UPDATE public.partner_sales SET delivery_status=target_status,delivery_driver_id=driver,delivery_address=address,delivery_contact=contact,delivery_details=details WHERE id=s.id RETURNING * INTO s;
  PERFORM set_config('distrihub.checked_delivery','',true);
  INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
  VALUES(gen_random_uuid()::text,op.company_id,coalesce(op.salesperson_id,op.company_id)::text,op.role,'entrega_atualizada','partner_sale',s.id::text,'Revisão '||s.delivery_revision::text||'; tentativa '||p_request_id::text);
 END IF;
 result:=partner_delivery_private.project_sale(s);
 INSERT INTO partner_delivery_private.requests(actor_id,request_id,payload,result) VALUES(auth.uid(),p_request_id,payload,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION partner_delivery_private.mutate(uuid,uuid,uuid,bigint,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_delivery_private.mutate(uuid,uuid,uuid,bigint,jsonb,uuid,text) TO authenticated;
CREATE FUNCTION public.mutate_partner_delivery_checked(p_request_id uuid,p_branch_id uuid,p_sale_id uuid,p_expected_revision bigint,p_patch jsonb,p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT partner_delivery_private.mutate(p_request_id,p_branch_id,p_sale_id,p_expected_revision,p_patch,p_salesperson_id,p_pin) $$;
REVOKE ALL ON FUNCTION public.mutate_partner_delivery_checked(uuid,uuid,uuid,bigint,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_partner_delivery_checked(uuid,uuid,uuid,bigint,jsonb,uuid,text) TO authenticated;
-- Legacy calls lack expected revision and proof; do not leave a bypass open.
REVOKE ALL ON FUNCTION public.execute_partner_delivery_mutation(uuid,text,uuid,text,uuid),public.save_partner_delivery_details(uuid,text,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
