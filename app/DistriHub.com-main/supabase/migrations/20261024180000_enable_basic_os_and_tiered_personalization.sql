BEGIN;

UPDATE public.saas_plans AS plan
SET features = ARRAY(
  SELECT DISTINCT feature
  FROM unnest(plan.features || ARRAY['os', 'personalizacao_basica']::text[]) AS item(feature)
  ORDER BY feature
)
WHERE plan.id = 'basico';

UPDATE public.saas_plans AS plan
SET features = ARRAY(
  SELECT DISTINCT feature
  FROM unnest(plan.features || ARRAY['personalizacao_basica', 'personalizacao_profissional']::text[]) AS item(feature)
  ORDER BY feature
)
WHERE plan.id IN ('profissional', 'enterprise');

CREATE OR REPLACE FUNCTION partner_subscription_private.guard_branding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  key text;
  previous jsonb;
  incoming jsonb := to_jsonb(NEW);
  company_id uuid := (to_jsonb(NEW)->>'user_id')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    IF COALESCE(NULLIF(current_setting('role', true), 'none'), session_user) IN ('postgres', 'service_role') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    previous := to_jsonb(OLD);
  ELSE
    previous := jsonb_build_object(
      'logo_url', NULL,
      'banner_url', NULL,
      'primary_color', '#3193e5',
      'nav_color', '#0b1927',
      'internal_notice', NULL,
      'receipt_footer_text', NULL,
      'show_logo_on_receipt', true,
      'show_cnpj_on_receipt', true,
      'service_warranty_terms', '',
      'personalization', '{}'::jsonb
    );
  END IF;

  IF ROW(
    incoming->>'logo_url',
    incoming->>'receipt_footer_text',
    incoming->>'show_logo_on_receipt',
    incoming->>'show_cnpj_on_receipt',
    incoming->>'service_warranty_terms'
  ) IS DISTINCT FROM ROW(
    previous->>'logo_url',
    previous->>'receipt_footer_text',
    previous->>'show_logo_on_receipt',
    previous->>'show_cnpj_on_receipt',
    previous->>'service_warranty_terms'
  ) AND NOT public.partner_has_saas_access(company_id, 'personalizacao_basica') THEN
    RAISE EXCEPTION 'Logo, impressão e termos de serviço exigem o plano Básico ou superior.';
  END IF;

  IF ROW(
    incoming->>'banner_url',
    incoming->>'primary_color',
    incoming->>'nav_color',
    incoming->>'internal_notice'
  ) IS DISTINCT FROM ROW(
    previous->>'banner_url',
    previous->>'primary_color',
    previous->>'nav_color',
    previous->>'internal_notice'
  ) AND NOT public.partner_has_saas_access(company_id, 'personalizacao_profissional') THEN
    RAISE EXCEPTION 'Banner, cores e avisos internos exigem o plano Profissional ou superior.';
  END IF;

  IF COALESCE(incoming->'personalization'->'receipt', '{}'::jsonb)
      IS DISTINCT FROM COALESCE(previous->'personalization'->'receipt', '{}'::jsonb)
     AND NOT public.partner_has_saas_access(company_id, 'personalizacao_basica') THEN
    RAISE EXCEPTION 'Preferências de impressão exigem o plano Básico ou superior.';
  END IF;

  FOREACH key IN ARRAY ARRAY['panel', 'catalog', 'pdv'] LOOP
    IF COALESCE(incoming->'personalization'->key, '{}'::jsonb)
        IS DISTINCT FROM COALESCE(previous->'personalization'->key, '{}'::jsonb)
       AND NOT public.partner_has_saas_access(company_id, 'white-label') THEN
      RAISE EXCEPTION 'Personalização avançada exige o plano Enterprise ou isenção com acesso completo.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.guard_branding() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS warranty_terms_snapshot text;

CREATE OR REPLACE FUNCTION partner_subscription_private.snapshot_service_order_warranty_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  SELECT COALESCE(settings.service_warranty_terms, '')
  INTO NEW.warranty_terms_snapshot
  FROM public.store_settings_v2 AS settings
  WHERE settings.user_id = NEW.user_id;

  IF NOT FOUND THEN
    NEW.warranty_terms_snapshot := '';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.snapshot_service_order_warranty_terms() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_order_warranty_terms_snapshot ON public.service_orders;
CREATE TRIGGER service_order_warranty_terms_snapshot
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION partner_subscription_private.snapshot_service_order_warranty_terms();

CREATE OR REPLACE FUNCTION public.update_service_order(
  p_service_order_id uuid,
  p_operator_id uuid,
  p_status text,
  p_technician_name text,
  p_reported_issue text,
  p_observations text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  company_id uuid;
  operator_branch_id uuid;
  existing_order public.service_orders%ROWTYPE;
  new_status public.service_orders.status%TYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  IF p_operator_id IS NULL THEN
    company_id := auth.uid();
    IF NOT EXISTS (SELECT 1 FROM public.partner_profiles WHERE id = company_id) THEN
      RAISE EXCEPTION 'Empresa não autorizada.';
    END IF;
  ELSE
    SELECT salesperson.user_id, salesperson.branch_id
    INTO company_id, operator_branch_id
    FROM public.partner_salespeople AS salesperson
    WHERE salesperson.id = p_operator_id
      AND salesperson.auth_user_id = auth.uid()
      AND salesperson.active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Operador não autorizado.';
    END IF;
    PERFORM partner_subscription_private.require_operator_module('os', p_operator_id);
  END IF;

  PERFORM partner_subscription_private.require_access(company_id, 'os');

  SELECT *
  INTO existing_order
  FROM public.service_orders
  WHERE id = p_service_order_id
    AND user_id = company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada nesta empresa.';
  END IF;
  IF p_operator_id IS NOT NULL
     AND operator_branch_id IS NOT NULL
     AND existing_order.branch_id IS DISTINCT FROM operator_branch_id THEN
    RAISE EXCEPTION 'Acesso negado: a ordem pertence a outra filial.';
  END IF;

  IF p_status NOT IN (
    'aberta', 'em_analise', 'aguardando_aprovacao', 'aprovada',
    'em_reparo', 'aguardando_peca', 'pronta', 'entregue', 'cancelada'
  ) THEN
    RAISE EXCEPTION 'Status da ordem de serviço inválido.';
  END IF;
  new_status := p_status;

  UPDATE public.service_orders
  SET status = new_status,
      technician_name = p_technician_name,
      reported_issue = p_reported_issue,
      observations = p_observations,
      updated_at = pg_catalog.now()
  WHERE id = p_service_order_id
    AND user_id = company_id;

  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_service_order(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_service_order(uuid, uuid, text, text, text, text) TO authenticated;

COMMIT;
