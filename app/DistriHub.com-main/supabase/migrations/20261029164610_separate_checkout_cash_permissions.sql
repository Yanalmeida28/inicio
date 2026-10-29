-- Checkout reads open destinations only; cash reports keep Caixa authorization.
CREATE FUNCTION public.read_partner_checkout_cash(
  p_branch_id uuid, p_salesperson_id uuid DEFAULT NULL, p_pin text DEFAULT NULL,
  p_module text DEFAULT 'pdv'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op record; available jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_module IS NULL OR p_module NOT IN ('pdv','pedidos','caixa') THEN RAISE EXCEPTION 'Módulo inválido'; END IF;
  PERFORM partner_subscription_private.require_operator_module(p_module,p_salesperson_id);
  PERFORM partner_subscription_private.require_actor(p_module);
  SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
  IF op.role NOT IN ('administrador','gerente','caixa','vendedor') THEN RAISE EXCEPTION 'Sem permissão para conferir o caixa da venda'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=op.company_id AND is_active=true)
    THEN RAISE EXCEPTION 'Filial inválida ou inativa'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.id,'branch_id',s.branch_id,'actor_key',s.actor_key,
    'operator_id',s.operator_id,'operator_name',s.operator_name,
    'opened_at',s.opened_at,'closed_at',s.closed_at
  ) ORDER BY s.opened_at DESC,s.id DESC),'[]'::jsonb) INTO available
  FROM public.partner_cash_sessions s
  WHERE s.user_id=op.company_id AND s.branch_id=p_branch_id AND s.closed_at IS NULL;
  RETURN jsonb_build_object('actor_key',COALESCE(op.salesperson_id,op.company_id),
    'can_manage',op.role IN ('administrador','gerente'),'sessions',available);
END;
$$;
REVOKE ALL ON FUNCTION public.read_partner_checkout_cash(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_partner_checkout_cash(uuid,uuid,text,text) TO authenticated;
