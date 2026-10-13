BEGIN;
CREATE INDEX IF NOT EXISTS partner_stock_movements_history_completion_idx ON public.stock_movements(user_id,branch_id,reason,created_at) WHERE type='saida' AND quantity>0;
CREATE OR REPLACE FUNCTION public.read_partner_sales_history(p_company_id uuid,p_branch_id uuid DEFAULT NULL,p_start date DEFAULT NULL,p_end date DEFAULT NULL,p_status text DEFAULT 'all',p_search text DEFAULT '',p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE result jsonb; actor uuid:=auth.uid(); owner boolean:=p_company_id=auth.uid(); admin boolean:=public.is_super_admin();
BEGIN
 IF actor IS NULL OR p_company_id IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 IF NOT (owner OR admin OR EXISTS(SELECT 1 FROM public.partner_salespeople WHERE user_id=p_company_id AND auth_user_id=actor AND active AND role IN ('administrador','gerente','caixa','vendedor','atendente'))) THEN RAISE EXCEPTION 'Empresa não autorizada.'; END IF;
 PERFORM partner_subscription_private.require_actor('pdv');
 PERFORM partner_subscription_private.require_access(p_company_id,'pdv');
 IF p_branch_id IS NOT NULL AND p_company_id IS DISTINCT FROM partner_operations_private.authorize_branch(p_branch_id,'pdv') THEN RAISE EXCEPTION 'Filial não autorizada.'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR p_status IS NULL OR p_status NOT IN ('all','concluida','cancelada','aberta','devolucao') OR length(coalesce(p_search,''))>200 OR p_start>p_end THEN RAISE EXCEPTION 'Filtros inválidos.'; END IF;
 WITH permitted AS (
  SELECT s.*,completion.completed_at,coalesce(completion.completed_at,s.created_at) AS history_at,EXISTS(SELECT 1 FROM public.rma_requests_v2 r WHERE r.sale_id=s.id AND r.user_id=s.user_id AND r.sale_item_index>=0 AND r.sale_item_index<jsonb_array_length(coalesce(s.items,'[]'::jsonb)) AND coalesce(r.quantity,1)>0) AS has_returns
  FROM public.partner_sales s LEFT JOIN LATERAL (
   SELECT min(m.created_at) AS completed_at FROM public.partner_stock_movements m
   WHERE m.user_id=s.user_id AND m.branch_id IS NOT DISTINCT FROM s.branch_id
    AND m.type='saida' AND m.quantity>0
    AND m.reason IN ('Saida por venda '||s.id::text,'Saída por venda '||s.id::text)
  ) completion ON true WHERE s.user_id=p_company_id AND s.status<>'pre_venda'
   AND (owner OR admin OR public.partner_employee_can_operate_sale(p_company_id,s.branch_id,s.salesperson_id))
   AND (p_branch_id IS NULL OR s.branch_id=p_branch_id)
   AND (p_start IS NULL OR coalesce(completion.completed_at,s.created_at)>=p_start::timestamp AT TIME ZONE 'America/Sao_Paulo')
   AND (p_end IS NULL OR coalesce(completion.completed_at,s.created_at)<(p_end+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
 ), filtered AS (
  SELECT * FROM permitted WHERE (p_status='all' OR p_status='devolucao' AND (has_returns OR status='devolucao') OR p_status<>'devolucao' AND status=p_status AND NOT has_returns)
   AND (coalesce(trim(p_search),'')='' OR position(translate(lower(trim(p_search)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') in translate(lower(concat_ws(' ',id::text,customer_name,imei,serial_number)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))>0)
 ), page AS (SELECT * FROM filtered ORDER BY history_at DESC,id DESC LIMIT 25 OFFSET p_page*25)
 SELECT jsonb_build_object('sales',(SELECT coalesce(jsonb_agg(to_jsonb(page)-'has_returns'-'history_at' ORDER BY history_at DESC,id DESC),'[]'::jsonb) FROM page),
  'rmas',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'sale_id',r.sale_id,'sale_item_index',r.sale_item_index,'quantity',r.quantity) ORDER BY r.id),'[]'::jsonb) FROM public.rma_requests_v2 r JOIN page s ON s.id=r.sale_id AND s.user_id=r.user_id),
  'total',(SELECT count(*) FROM filtered),'completed_total',(SELECT coalesce(sum(total) FILTER(WHERE status='concluida'),0) FROM filtered),'page_size',25) INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.read_partner_sales_history(uuid,uuid,date,date,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_partner_sales_history(uuid,uuid,date,date,text,text,integer) TO authenticated;
COMMIT;
