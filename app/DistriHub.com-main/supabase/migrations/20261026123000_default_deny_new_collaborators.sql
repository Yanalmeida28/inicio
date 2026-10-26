BEGIN;

ALTER TABLE public.partner_salespeople
  ALTER COLUMN active SET DEFAULT false,
  ALTER COLUMN blocked_modules SET DEFAULT ARRAY[
    'cadastros',
    'pdv',
    'caixa',
    'pedidos',
    'os',
    'historico',
    'suporte',
    'fiscal',
    'administrativo',
    'entregas',
    'financeiro',
    'rma',
    'relatorios',
    'white-label',
    'configuracoes'
  ]::text[];

CREATE OR REPLACE FUNCTION partner_subscription_private.default_deny_new_collaborator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.active := false;
  NEW.blocked_modules := ARRAY[
    'cadastros',
    'pdv',
    'caixa',
    'pedidos',
    'os',
    'historico',
    'suporte',
    'fiscal',
    'administrativo',
    'entregas',
    'financeiro',
    'rma',
    'relatorios',
    'white-label',
    'configuracoes'
  ]::text[];

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.default_deny_new_collaborator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS partner_salespeople_default_deny ON public.partner_salespeople;
CREATE TRIGGER partner_salespeople_default_deny
  BEFORE INSERT ON public.partner_salespeople
  FOR EACH ROW
  EXECUTE FUNCTION partner_subscription_private.default_deny_new_collaborator();

COMMIT;
