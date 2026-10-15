BEGIN;
ALTER TABLE public.partner_suppliers ADD COLUMN branch_id uuid REFERENCES public.partner_branches(id) ON DELETE RESTRICT;
ALTER TABLE public.partner_categories ADD COLUMN branch_id uuid REFERENCES public.partner_branches(id) ON DELETE RESTRICT;
CREATE INDEX partner_suppliers_company_branch ON public.partner_suppliers(branch_id,user_id);
CREATE INDEX partner_categories_company_branch ON public.partner_categories(branch_id,user_id);

-- A single-branch company has no ambiguity. Preserve unresolved legacy rows
-- for the owner in consolidated view instead of assigning them arbitrarily.
WITH sole AS (SELECT user_id,(array_agg(id))[1] branch_id FROM public.partner_branches GROUP BY user_id HAVING count(*)=1)
UPDATE public.partner_suppliers s SET branch_id=b.branch_id FROM sole b WHERE s.user_id=b.user_id;
WITH sole AS (SELECT user_id,(array_agg(id))[1] branch_id FROM public.partner_branches GROUP BY user_id HAVING count(*)=1)
UPDATE public.partner_categories c SET branch_id=b.branch_id FROM sole b WHERE c.user_id=b.user_id;
WITH matched AS (
 SELECT c.id,(array_agg(DISTINCT p.branch_id))[1] branch_id FROM public.partner_categories c
 JOIN public.partner_products p ON p.user_id=c.user_id AND lower(btrim(p.category))=lower(btrim(c.name))
 WHERE p.branch_id IS NOT NULL AND c.branch_id IS NULL GROUP BY c.id HAVING count(DISTINCT p.branch_id)=1
) UPDATE public.partner_categories c SET branch_id=m.branch_id FROM matched m WHERE c.id=m.id;

-- The owner explicitly identified these legacy Saunier records as wholesale.
-- Resolve by the two store names rather than embedding generated UUIDs.
DO $data$
DECLARE target record;
BEGIN
 IF (SELECT count(*) FROM public.partner_branches a WHERE upper(btrim(a.name))='SAUNIER ELETRON ATACADO' AND EXISTS(SELECT 1 FROM public.partner_branches v WHERE v.user_id=a.user_id AND upper(btrim(v.name))='SAUNIER ELETRON VAREJO'))>1 THEN RAISE EXCEPTION 'Identificação da empresa Saunier ambígua; revisar atribuição'; END IF;
 FOR target IN SELECT a.id,a.user_id FROM public.partner_branches a
 WHERE upper(btrim(a.name))='SAUNIER ELETRON ATACADO'
 AND EXISTS(SELECT 1 FROM public.partner_branches v WHERE v.user_id=a.user_id AND upper(btrim(v.name))='SAUNIER ELETRON VAREJO') LOOP
  IF EXISTS(SELECT 1 FROM public.partner_branches a WHERE a.user_id=target.user_id AND upper(btrim(a.name))='SAUNIER ELETRON ATACADO' AND a.id<>target.id) THEN RAISE EXCEPTION 'Filial Atacado ambígua'; END IF;
  IF EXISTS(SELECT 1 FROM public.partner_products p JOIN public.partner_suppliers s ON s.id=p.supplier_id WHERE s.user_id=target.user_id AND s.branch_id IS NULL AND p.branch_id<>target.id) THEN RAISE EXCEPTION 'Fornecedor Saunier possui vínculo em outra filial; revisar atribuição'; END IF;
  UPDATE public.partner_suppliers SET branch_id=target.id WHERE user_id=target.user_id AND branch_id IS NULL;
  UPDATE public.partner_categories SET branch_id=target.id WHERE user_id=target.user_id AND branch_id IS NULL;
 END LOOP;
END $data$;

CREATE FUNCTION partner_cadastros_private.guard_directory_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE candidates uuid[];
BEGIN
 IF TG_OP='UPDATE' AND OLD.branch_id IS NOT NULL AND (NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN RAISE EXCEPTION 'O cadastro pertence a outra filial. Crie um cadastro separado.'; END IF;
 IF NEW.branch_id IS NULL THEN
  SELECT array_agg(id) INTO candidates FROM public.partner_branches WHERE user_id=NEW.user_id;
  IF cardinality(candidates)=1 THEN NEW.branch_id:=candidates[1]; ELSE RAISE EXCEPTION 'Selecione uma filial para este cadastro.'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=NEW.branch_id AND user_id=NEW.user_id AND is_active) THEN RAISE EXCEPTION 'Filial não autorizada.'; END IF;
 IF TG_TABLE_NAME='partner_suppliers' AND EXISTS(SELECT 1 FROM public.partner_products WHERE supplier_id=NEW.id AND branch_id IS DISTINCT FROM NEW.branch_id) THEN RAISE EXCEPTION 'Fornecedor usado em outra filial. Separe os cadastros antes de atribuir.'; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION partner_cadastros_private.guard_directory_branch() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER directory_branch BEFORE INSERT OR UPDATE ON public.partner_suppliers FOR EACH ROW EXECUTE FUNCTION partner_cadastros_private.guard_directory_branch();
CREATE TRIGGER directory_branch BEFORE INSERT OR UPDATE ON public.partner_categories FOR EACH ROW EXECUTE FUNCTION partner_cadastros_private.guard_directory_branch();

CREATE POLICY directory_branch_scope ON public.partner_suppliers AS RESTRICTIVE FOR ALL TO authenticated
USING(user_id=(SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id,branch_id)))
WITH CHECK(user_id=(SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id,branch_id)));
CREATE POLICY directory_branch_scope ON public.partner_categories AS RESTRICTIVE FOR ALL TO authenticated
USING(user_id=(SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id,branch_id)))
WITH CHECK(user_id=(SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id,branch_id)));

CREATE FUNCTION partner_cadastros_private.mutate_branch_supplier(p_branch_id uuid,p_supplier_id uuid,p_name text,p_phone text,p_notes text,p_document text,p_delete boolean,p_operator_id uuid,p_operator_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE operator record; supplier public.partner_suppliers%ROWTYPE;
BEGIN
 PERFORM partner_subscription_private.require_actor('cadastros');
 PERFORM partner_subscription_private.require_operator_module('cadastros',p_operator_id);
 SELECT * INTO operator FROM public.resolve_partner_operator(p_operator_id,p_operator_pin,p_branch_id);
 IF p_branch_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=operator.company_id AND is_active) THEN RAISE EXCEPTION 'Selecione uma filial autorizada.'; END IF;
 IF p_supplier_id IS NOT NULL THEN
  SELECT * INTO supplier FROM public.partner_suppliers WHERE id=p_supplier_id AND user_id=operator.company_id FOR UPDATE;
  IF NOT FOUND OR (supplier.branch_id IS NOT NULL AND supplier.branch_id<>p_branch_id) OR (supplier.branch_id IS NULL AND auth.uid()<>supplier.user_id) THEN RAISE EXCEPTION 'Fornecedor não autorizado nesta filial.'; END IF;
 END IF;
 IF p_delete THEN
  IF p_supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor não informado.'; END IF;
  DELETE FROM public.partner_suppliers WHERE id=supplier.id;
 ELSE
  IF coalesce(length(btrim(p_name)),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Informe o nome do fornecedor.'; END IF;
  IF p_supplier_id IS NULL THEN
   INSERT INTO public.partner_suppliers(user_id,branch_id,name,phone,notes,document,payable_balance) VALUES(operator.company_id,p_branch_id,btrim(p_name),p_phone,p_notes,p_document,0) RETURNING * INTO supplier;
  ELSE
   UPDATE public.partner_suppliers SET branch_id=p_branch_id,name=btrim(p_name),phone=p_phone,notes=p_notes,document=p_document WHERE id=supplier.id RETURNING * INTO supplier;
  END IF;
 END IF;
 INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
 VALUES('audit-'||gen_random_uuid()::text,operator.company_id,coalesce((SELECT name FROM public.partner_salespeople WHERE id=operator.salesperson_id),'Administrador'),operator.role,CASE WHEN p_delete THEN 'Fornecedor Excluído' ELSE 'Fornecedor Salvo' END,'fornecedor',supplier.id::text,'Filial '||p_branch_id::text);
 RETURN to_jsonb(supplier);
END $fn$;
REVOKE ALL ON FUNCTION partner_cadastros_private.mutate_branch_supplier(uuid,uuid,text,text,text,text,boolean,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_cadastros_private.mutate_branch_supplier(uuid,uuid,text,text,text,text,boolean,uuid,text) TO authenticated;
CREATE FUNCTION public.mutate_partner_branch_supplier(p_branch_id uuid,p_supplier_id uuid,p_name text,p_phone text,p_notes text,p_document text,p_delete boolean,p_operator_id uuid DEFAULT NULL,p_operator_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT partner_cadastros_private.mutate_branch_supplier(p_branch_id,p_supplier_id,p_name,p_phone,p_notes,p_document,p_delete,p_operator_id,p_operator_pin);
$fn$;
REVOKE ALL ON FUNCTION public.mutate_partner_branch_supplier(uuid,uuid,text,text,text,text,boolean,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_partner_branch_supplier(uuid,uuid,text,text,text,text,boolean,uuid,text) TO authenticated;

CREATE FUNCTION partner_cadastros_private.guard_product_supplier_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NEW.supplier_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
  IF NOT EXISTS(SELECT 1 FROM public.partner_suppliers WHERE id=NEW.supplier_id AND user_id=NEW.user_id AND branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Fornecedor não pertence à filial do produto.'; END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION partner_cadastros_private.guard_product_supplier_branch() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER supplier_branch BEFORE INSERT OR UPDATE ON public.partner_products FOR EACH ROW EXECUTE FUNCTION partner_cadastros_private.guard_product_supplier_branch();

DO $xml$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('partner_cadastros_private.import_stock_xml(uuid,jsonb,uuid,text)'::regprocedure);
 IF position('WHERE user_id=operator.company_id AND regexp_replace' IN definition)=0 THEN RAISE EXCEPTION 'Importação XML mudou; revisar separação por filial'; END IF;
 definition:=replace(definition,'WHERE user_id=operator.company_id AND regexp_replace','WHERE user_id=operator.company_id AND branch_id=p_branch_id AND regexp_replace');
 definition:=replace(definition,'partner_suppliers(user_id,name,document,phone,payable_balance) VALUES(operator.company_id,','partner_suppliers(user_id,branch_id,name,document,phone,payable_balance) VALUES(operator.company_id,p_branch_id,');
 IF position('partner_suppliers(user_id,branch_id' IN definition)=0 THEN RAISE EXCEPTION 'Não foi possível ajustar o fornecedor do XML'; END IF;
 EXECUTE definition;
END $xml$;
NOTIFY pgrst,'reload schema';
COMMIT;
