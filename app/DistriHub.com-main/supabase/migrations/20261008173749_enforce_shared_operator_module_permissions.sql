CREATE FUNCTION partner_subscription_private.require_operator_module(p_feature text,p_operator uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE feature text:=CASE WHEN p_feature='estoque' THEN 'cadastros' ELSE p_feature END;
BEGIN
 IF p_operator IS NOT NULL AND EXISTS(SELECT 1 FROM public.partner_salespeople
 WHERE id=p_operator AND active=true AND feature=ANY(blocked_modules))
 THEN RAISE EXCEPTION 'Acesso a este módulo bloqueado pelo administrador.'; END IF;
END; $$;
REVOKE ALL ON FUNCTION partner_subscription_private.require_operator_module(text,uuid) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f record; definition text; feature text; parameter text; BEGIN
 FOR f IN SELECT oid,proargnames FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' LOOP
 definition:=pg_get_functiondef(f.oid);
 feature:=substring(definition FROM 'require_actor\(''([^'']+)''\)');
 IF feature IS NULL THEN CONTINUE; END IF;
 parameter:=CASE WHEN 'p_operator_id'=ANY(f.proargnames) THEN 'p_operator_id' WHEN 'p_salesperson_id'=ANY(f.proargnames) THEN 'p_salesperson_id' ELSE NULL END;
 IF parameter IS NOT NULL THEN
 definition:=regexp_replace(definition,'\mBEGIN\M',format('BEGIN PERFORM partner_subscription_private.require_operator_module(%L,%I);',feature,parameter),'i');
 EXECUTE definition;
 END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.update_partner_salesperson_access(uuid,text,text,numeric,text,text,boolean,uuid,uuid,text,text,text[])'::regprocedure) INTO definition;
 EXECUTE regexp_replace(definition,'\mBEGIN\M','BEGIN PERFORM partner_subscription_private.require_operator_module(''administrativo'',p_operator_id);','i');
END; $$;
