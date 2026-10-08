BEGIN;
DO $$
DECLARE sp public.partner_salespeople; updated public.partner_salespeople; denied boolean;
BEGIN
 SELECT * INTO STRICT sp FROM public.partner_salespeople WHERE active=true LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',sp.user_id::text,true);
 updated:=public.update_partner_salesperson_access(sp.id,sp.name,sp.role,sp.commission_rate,sp.phone,sp.email,sp.active,sp.branch_id,NULL,NULL,NULL,ARRAY['pdv','cadastros']);
 IF updated.blocked_modules<>ARRAY['pdv','cadastros'] THEN RAISE EXCEPTION 'Permission persistence failed'; END IF;
 denied:=false;
 BEGIN PERFORM partner_subscription_private.require_operator_module('pdv',sp.id);
 EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'Acesso a este módulo%' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Shared operator was not blocked'; END IF;
 PERFORM partner_subscription_private.require_operator_module('caixa',sp.id);
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 denied:=false;
 BEGIN PERFORM public.update_partner_salesperson_access(sp.id,sp.name,sp.role,sp.commission_rate,sp.phone,sp.email,sp.active,sp.branch_id,NULL,NULL,NULL,'{}');
 EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'Somente o proprietário%' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Foreign actor changed access'; END IF;
 denied:=false;
 BEGIN UPDATE public.partner_salespeople SET blocked_modules='{}' WHERE id=sp.id;
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Direct update bypassed owner guard'; END IF;
END; $$;
ROLLBACK;
SELECT 'Permissões persistem; módulo bloqueado e módulo liberado validados; alteração indevida negada; teste revertido' AS verification;
