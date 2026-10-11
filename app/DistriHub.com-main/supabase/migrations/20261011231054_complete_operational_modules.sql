BEGIN;
CREATE SCHEMA IF NOT EXISTS partner_operations_private;
REVOKE ALL ON SCHEMA partner_operations_private FROM PUBLIC, anon, authenticated;
CREATE TABLE partner_operations_private.invoice_payment_requests (
  user_id uuid NOT NULL, request_id uuid NOT NULL, invoice_id uuid NOT NULL,
  amount numeric NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id)
);
CREATE FUNCTION public.record_partner_invoice_payment_once(p_invoice_id uuid,p_amount numeric,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_auth uuid := auth.uid(); v_request record; v_result uuid;
BEGIN
  PERFORM partner_subscription_private.require_actor('financeiro');
  IF v_auth IS NULL OR p_request_id IS NULL OR p_invoice_id IS NULL THEN RAISE EXCEPTION 'Recebimento sem identificação'; END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount<>round(p_amount,2) THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_auth::text||p_request_id::text,0));
  SELECT * INTO v_request FROM partner_operations_private.invoice_payment_requests WHERE user_id=v_auth AND request_id=p_request_id;
  IF FOUND THEN
    IF v_request.invoice_id IS DISTINCT FROM p_invoice_id OR v_request.amount IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'Identificador já utilizado com outro recebimento'; END IF;
    RETURN v_request.invoice_id;
  END IF;
  v_result := public.record_partner_invoice_payment(p_invoice_id,p_amount);
  INSERT INTO partner_operations_private.invoice_payment_requests(user_id,request_id,invoice_id,amount) VALUES(v_auth,p_request_id,v_result,p_amount);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_partner_invoice_payment_once(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_partner_invoice_payment_once(uuid,numeric,uuid) TO authenticated;

ALTER TABLE public.partner_sales ADD COLUMN IF NOT EXISTS cost_snapshot jsonb;
ALTER TABLE public.partner_sales ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE public.partner_sales ADD COLUMN IF NOT EXISTS delivery_contact text;
ALTER TABLE public.partner_sales ADD COLUMN IF NOT EXISTS delivery_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.partner_sales ADD COLUMN IF NOT EXISTS delivery_history jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE FUNCTION partner_operations_private.capture_sale_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer record; v_costs jsonb;
BEGIN
  IF NEW.status='concluida' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'concluida' AND OLD.cost_snapshot IS NULL) THEN
    SELECT jsonb_object_agg(p.id::text, CASE WHEN COALESCE(p.is_service,false) THEN 0 ELSE p.cost_price END)
      INTO v_costs FROM public.partner_products p WHERE p.user_id=NEW.user_id
        AND p.id IN (SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(NEW.items) x);
    NEW.cost_snapshot := COALESCE(v_costs,'{}'::jsonb);
  ELSIF TG_OP='UPDATE' THEN NEW.cost_snapshot := OLD.cost_snapshot;
  END IF;
  IF NEW.delivery_type='entrega' AND (TG_OP='INSERT' OR OLD.delivery_type IS DISTINCT FROM 'entrega') THEN
    SELECT * INTO v_customer FROM public.partner_customers WHERE id=NEW.customer_id AND user_id=NEW.user_id;
    IF FOUND THEN
      NEW.delivery_address := NULLIF(concat_ws(', ',NULLIF(v_customer.address,''),NULLIF(v_customer.address_number,''),NULLIF(v_customer.complement,''),NULLIF(v_customer.neighborhood,''),NULLIF(v_customer.city,''),NULLIF(v_customer.state,''),NULLIF(v_customer.zip_code,'')),'');
      NEW.delivery_contact := v_customer.phone;
    END IF;
  END IF;
  IF NEW.delivery_type='entrega' AND (TG_OP='INSERT' OR NEW.delivery_status IS DISTINCT FROM OLD.delivery_status OR NEW.delivery_driver_id IS DISTINCT FROM OLD.delivery_driver_id OR NEW.delivery_details IS DISTINCT FROM OLD.delivery_details) THEN
    NEW.delivery_history := CASE WHEN TG_OP='INSERT' THEN '[]'::jsonb ELSE OLD.delivery_history END || jsonb_build_array(jsonb_build_object('status',COALESCE(NEW.delivery_status,'pendente'),'driver_id',NEW.delivery_driver_id,'at',now(),'actor_id',auth.uid(),'details',NEW.delivery_details));
  ELSIF TG_OP='UPDATE' THEN NEW.delivery_history := OLD.delivery_history;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION partner_operations_private.capture_sale_snapshot() FROM PUBLIC;
CREATE TRIGGER capture_sale_operational_snapshot BEFORE INSERT OR UPDATE ON public.partner_sales FOR EACH ROW EXECUTE FUNCTION partner_operations_private.capture_sale_snapshot();

CREATE FUNCTION public.save_partner_delivery_details(p_salesperson_id uuid,p_pin text,p_sale_id uuid,p_status text,p_driver_id uuid,p_details jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_details IS NULL OR jsonb_typeof(p_details)<>'object' OR octet_length(p_details::text)>12000 THEN RAISE EXCEPTION 'Detalhes inválidos'; END IF;
  IF length(COALESCE(p_details->>'address',''))>1500 OR length(COALESCE(p_details->>'contact',''))>200 THEN RAISE EXCEPTION 'Endereço ou contato muito longo'; END IF;
  IF NULLIF(p_details->>'scheduled_date','') IS NOT NULL THEN PERFORM (p_details->>'scheduled_date')::date; END IF;
  IF p_status='falhou' AND NULLIF(trim(p_details->>'failure_reason'),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da falha'; END IF;
  IF p_status='entregue' AND NULLIF(trim(p_details->>'received_by'),'') IS NULL THEN RAISE EXCEPTION 'Informe quem recebeu a entrega'; END IF;
  PERFORM public.execute_partner_delivery_mutation(p_salesperson_id,p_pin,p_sale_id,p_status,p_driver_id);
  UPDATE public.partner_sales SET delivery_address=NULLIF(trim(p_details->>'address'),''),delivery_contact=NULLIF(trim(p_details->>'contact'),''),
    delivery_details=jsonb_build_object('scheduled_date',p_details->>'scheduled_date','failure_reason',p_details->>'failure_reason','received_by',p_details->>'received_by','notes',p_details->>'notes')
      || CASE WHEN p_status='entregue' THEN jsonb_build_object('delivered_at',now()) ELSE '{}'::jsonb END
    WHERE id=p_sale_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.save_partner_delivery_details(uuid,text,uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_partner_delivery_details(uuid,text,uuid,text,uuid,jsonb) TO authenticated;

ALTER TABLE public.rma_requests_v2 ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.rma_requests_v2 ADD CONSTRAINT rma_attachment_array CHECK(jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=3);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('rma-attachments','rma-attachments',false,20971520,ARRAY['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/webm']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY rma_file_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='rma-attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY rma_file_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='rma-attachments' AND (storage.foldername(name))[1]=auth.uid()::text) WITH CHECK(bucket_id='rma-attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY rma_file_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='rma-attachments' AND ((storage.foldername(name))[1]=auth.uid()::text OR EXISTS(SELECT 1 FROM public.rma_requests_v2 r WHERE r.id::text=(storage.foldername(name))[2] AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.attachments) a WHERE a->>'path'=name))));

CREATE TABLE public.partner_crm_tasks (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.partner_profiles(id),
  branch_id uuid NOT NULL REFERENCES public.partner_branches(id),customer_id uuid NOT NULL REFERENCES public.partner_customers(id),
  description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 4000),
  due_date date NOT NULL, responsible_id uuid REFERENCES public.partner_salespeople(id),
  status text NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','concluida')),
  completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX partner_crm_tasks_scope ON public.partner_crm_tasks(user_id,branch_id,due_date);
CREATE POLICY crm_tasks_select ON public.partner_crm_tasks FOR SELECT TO authenticated USING(public.partner_has_saas_access(user_id,'relatorios') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id)));
CREATE POLICY crm_tasks_insert ON public.partner_crm_tasks FOR INSERT TO authenticated WITH CHECK(public.partner_has_saas_access(user_id,'relatorios') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id)) AND EXISTS(SELECT 1 FROM public.partner_customers c WHERE c.id=customer_id AND c.user_id=partner_crm_tasks.user_id) AND EXISTS(SELECT 1 FROM public.partner_branches b WHERE b.id=branch_id AND b.user_id=partner_crm_tasks.user_id) AND (responsible_id IS NULL OR EXISTS(SELECT 1 FROM public.partner_salespeople s WHERE s.id=responsible_id AND s.user_id=partner_crm_tasks.user_id AND (s.branch_id IS NULL OR s.branch_id=partner_crm_tasks.branch_id))));
CREATE POLICY crm_tasks_update ON public.partner_crm_tasks FOR UPDATE TO authenticated USING(public.partner_has_saas_access(user_id,'relatorios') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id))) WITH CHECK(public.partner_has_saas_access(user_id,'relatorios') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id)));
GRANT SELECT,INSERT ON public.partner_crm_tasks TO authenticated;
GRANT UPDATE(status,completed_at) ON public.partner_crm_tasks TO authenticated;
REVOKE ALL ON public.partner_crm_tasks FROM anon;
CREATE FUNCTION partner_operations_private.stamp_crm_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM partner_subscription_private.require_actor('relatorios');
  IF TG_OP='INSERT' THEN NEW.created_at:=now(); NEW.status:='pendente'; NEW.completed_at:=NULL;
  ELSIF NEW.status='concluida' AND OLD.status='pendente' THEN NEW.completed_at:=now();
  ELSE NEW.completed_at:=OLD.completed_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION partner_operations_private.stamp_crm_task() FROM PUBLIC;
CREATE TRIGGER stamp_crm_task BEFORE INSERT OR UPDATE ON public.partner_crm_tasks FOR EACH ROW EXECUTE FUNCTION partner_operations_private.stamp_crm_task();
COMMIT;
