-- Enforce invariants on every write, including direct Data API requests.
-- No historical rows or customer acknowledgments are backfilled.
CREATE OR REPLACE FUNCTION partner_cadastros_private.valid_document(value text, kind text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE digits text:=regexp_replace(coalesce(value,''),'[^0-9]','','g'); weights integer[]; total integer; expected integer; pass integer; i integer;
BEGIN
 IF nullif(btrim(value),'') IS NULL THEN RETURN true; END IF;
 IF value ~ '[^0-9./[:space:]-]' OR kind IS NULL OR kind NOT IN ('PF','PJ')
  OR length(digits)<>(CASE WHEN kind='PJ' THEN 14 ELSE 11 END)
  OR digits=repeat(substr(digits,1,1),length(digits)) THEN RETURN false; END IF;
 FOR pass IN 1..2 LOOP
  weights:=CASE WHEN kind='PF' AND pass=1 THEN ARRAY[10,9,8,7,6,5,4,3,2]
   WHEN kind='PF' THEN ARRAY[11,10,9,8,7,6,5,4,3,2]
   WHEN pass=1 THEN ARRAY[5,4,3,2,9,8,7,6,5,4,3,2]
   ELSE ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2] END;
  total:=0;
  FOR i IN 1..array_length(weights,1) LOOP total:=total+substr(digits,i,1)::integer*weights[i]; END LOOP;
  expected:=(total*10)%11; IF expected=10 THEN expected:=0; END IF;
  IF expected<>substr(digits,array_length(weights,1)+1,1)::integer THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION partner_cadastros_private.valid_document(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION partner_cadastros_private.guard_customer_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'A empresa do cliente não pode ser alterada.'; END IF;
 NEW.name:=btrim(NEW.name);
 IF coalesce(NEW.name,'')='' THEN RAISE EXCEPTION 'Nome obrigatório.'; END IF;
 IF NEW.credit_limit IS NULL OR NEW.credit_limit<0 OR NEW.credit_limit::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Limite de crédito inválido.'; END IF;
 -- Existing documents are not silently rewritten or blocked on unrelated edits.
 IF TG_OP='INSERT' OR NEW.document IS DISTINCT FROM OLD.document OR NEW.person_type IS DISTINCT FROM OLD.person_type THEN
  IF NOT partner_cadastros_private.valid_document(NEW.document,NEW.person_type) THEN RAISE EXCEPTION 'Informe um CPF/CNPJ válido para o tipo de pessoa.'; END IF;
 END IF;
 IF NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_branches b WHERE b.id=NEW.branch_id AND b.user_id=NEW.user_id) THEN RAISE EXCEPTION 'Filial do cliente não autorizada.'; END IF;
 IF NEW.salesperson_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople s WHERE s.id=NEW.salesperson_id AND s.user_id=NEW.user_id AND (s.branch_id IS NULL OR s.branch_id IS NOT DISTINCT FROM NEW.branch_id)) THEN RAISE EXCEPTION 'Vendedor de outra empresa ou filial.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_cadastros_private.guard_customer_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER customer_integrity BEFORE INSERT OR UPDATE ON public.partner_customers FOR EACH ROW EXECUTE FUNCTION partner_cadastros_private.guard_customer_integrity();

CREATE OR REPLACE FUNCTION partner_operations_private.guard_crm_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'A empresa da tarefa não pode ser alterada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches b WHERE b.id=NEW.branch_id AND b.user_id=NEW.user_id) THEN RAISE EXCEPTION 'Filial da tarefa não autorizada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_customers c WHERE c.id=NEW.customer_id AND c.user_id=NEW.user_id AND (c.branch_id IS NULL OR c.branch_id=NEW.branch_id)) THEN RAISE EXCEPTION 'Cliente de outra empresa ou filial.'; END IF;
 IF NEW.responsible_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople s WHERE s.id=NEW.responsible_id AND s.user_id=NEW.user_id AND (s.branch_id IS NULL OR s.branch_id=NEW.branch_id)) THEN RAISE EXCEPTION 'Responsável de outra empresa ou filial.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_operations_private.guard_crm_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE ON public.partner_crm_tasks FOR EACH ROW EXECUTE FUNCTION partner_operations_private.guard_crm_integrity();

CREATE OR REPLACE FUNCTION partner_cadastros_private.guard_modifier_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'A empresa do modificador não pode ser alterada.'; END IF;
 NEW.name:=btrim(NEW.name);
 IF coalesce(NEW.name,'')='' THEN RAISE EXCEPTION 'Nome do modificador obrigatório.'; END IF;
 IF NEW.price_adjustment IS NULL OR NEW.price_adjustment::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Ajuste de preço inválido.'; END IF;
 IF NEW.product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_products p WHERE p.id=NEW.product_id AND p.user_id=NEW.user_id) THEN RAISE EXCEPTION 'Produto de outra empresa.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_cadastros_private.guard_modifier_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER modifier_integrity BEFORE INSERT OR UPDATE ON public.partner_modifiers FOR EACH ROW EXECUTE FUNCTION partner_cadastros_private.guard_modifier_integrity();

ALTER TABLE public.service_orders
 ADD COLUMN inspection_version integer NOT NULL DEFAULT 0,
 ADD COLUMN entry_checklist jsonb,
 ADD COLUMN entry_recorded_at timestamptz,
 ADD COLUMN entry_recorded_by uuid,
 ADD COLUMN customer_acknowledged_at timestamptz,
 ADD COLUMN customer_acknowledged_by uuid,
 ADD COLUMN exit_checklist jsonb,
 ADD COLUMN exit_recorded_at timestamptz,
 ADD COLUMN exit_recorded_by uuid,
 ADD COLUMN warranty_snapshot text,
 ADD COLUMN warranty_snapshot_at timestamptz;

-- Parse the existing wire format for compatibility with already-open browsers
-- and pending idempotent attempts. The database validates every required item
-- and stores a structured snapshot; a marker alone is never sufficient.
CREATE OR REPLACE FUNCTION partner_service_orders_private.parse_checklist(notes text,equipment text,phase text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['power','charging','battery','buttons','housing','moisture'];
 labels text[]:=ARRAY['Liga e desliga','Carregamento / alimentação','Bateria','Botões','Carcaça / trincas / marcas','Condição quanto à umidade'];
 opening text:='[Checklist de '||phase||']'; closing text:='[/Checklist de '||phase||']'; block text; lines text[]; line text; result text; output jsonb:='{}'; i integer;
BEGIN
 IF phase IS NULL OR phase NOT IN ('entrada','saída') THEN RAISE EXCEPTION 'Etapa de checklist inválida.' USING ERRCODE='22023'; END IF;
 IF strpos(coalesce(notes,''),opening)=0 THEN RETURN NULL; END IF;
 IF coalesce(equipment,'') ~* 'celular|smartphone|tablet|iphone|ipad' THEN
  keys:=keys||ARRAY['screen','touch','camera','rear_camera','flash','microphone','speaker','calls','wifi','bluetooth','sim','biometrics','vibration','proximity','connector'];
  labels:=labels||ARRAY['Tela / imagem','Touch','Câmera frontal','Câmera traseira','Flash','Microfone','Alto-falante','Áudio de chamadas','Wi-Fi','Bluetooth','Sinal / chip','Biometria / reconhecimento facial','Vibração','Sensor de proximidade','Conector de carga'];
 ELSE
  keys:=keys||ARRAY['operation','connections']; labels:=labels||ARRAY['Funcionamento geral','Conectores / cabos'];
 END IF;
 IF length(notes)-length(replace(notes,opening,''))<>length(opening) OR length(notes)-length(replace(notes,closing,''))<>length(closing) THEN RAISE EXCEPTION 'Checklist de % inválido ou duplicado.',phase USING ERRCODE='22023'; END IF;
 block:=split_part(notes,opening||E'\n',2);
 IF block='' OR strpos(block,E'\n'||closing)=0 THEN RAISE EXCEPTION 'Checklist de % incompleto.',phase USING ERRCODE='22023'; END IF;
 block:=split_part(block,E'\n'||closing,1); lines:=string_to_array(block,E'\n');
 IF cardinality(lines)<>cardinality(keys) THEN RAISE EXCEPTION 'Complete todos os itens do checklist de %.',phase USING ERRCODE='22023'; END IF;
 FOR i IN 1..cardinality(keys) LOOP
  SELECT l INTO line FROM unnest(lines) AS l WHERE starts_with(l,labels[i]||': ') LIMIT 1;
  result:=substr(line,length(labels[i])+3);
  IF result IS NULL OR result NOT IN ('Funcionando','Com defeito','Não testado','Não se aplica') THEN RAISE EXCEPTION 'Confira o item % do checklist de %.',labels[i],phase USING ERRCODE='22023'; END IF;
  output:=output||jsonb_build_object(keys[i],result);
 END LOOP;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION partner_service_orders_private.parse_checklist(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION partner_service_orders_private.guard_inspection_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry_data jsonb; exit_data jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Identifique o responsável pela vistoria.'; END IF;
  entry_data:=partner_service_orders_private.parse_checklist(NEW.entry_notes,NEW.equipment_type,'entrada');
  IF entry_data IS NULL OR NOT ('Cliente ciente das condições de entrada: sim.'=ANY(string_to_array(coalesce(NEW.entry_notes,''),E'\n'))) THEN RAISE EXCEPTION 'Complete o checklist de entrada e registre a ciência do cliente.' USING ERRCODE='22023'; END IF;
  NEW.inspection_version:=1; NEW.entry_checklist:=entry_data;
  NEW.entry_recorded_at:=now(); NEW.entry_recorded_by:=auth.uid();
  NEW.customer_acknowledged_at:=now(); NEW.customer_acknowledged_by:=auth.uid();
  SELECT coalesce(s.service_warranty_terms,'') INTO NEW.warranty_snapshot FROM public.store_settings_v2 s WHERE s.user_id=NEW.user_id;
  NEW.warranty_snapshot:=coalesce(NEW.warranty_snapshot,''); NEW.warranty_snapshot_at:=now();
  NEW.exit_checklist:=NULL; NEW.exit_recorded_at:=NULL; NEW.exit_recorded_by:=NULL;
 ELSE
  IF ROW(NEW.inspection_version,NEW.entry_checklist,NEW.entry_recorded_at,NEW.entry_recorded_by,NEW.customer_acknowledged_at,NEW.customer_acknowledged_by,NEW.warranty_snapshot,NEW.warranty_snapshot_at)
   IS DISTINCT FROM ROW(OLD.inspection_version,OLD.entry_checklist,OLD.entry_recorded_at,OLD.entry_recorded_by,OLD.customer_acknowledged_at,OLD.customer_acknowledged_by,OLD.warranty_snapshot,OLD.warranty_snapshot_at) THEN RAISE EXCEPTION 'O registro original da vistoria e da garantia não pode ser alterado.'; END IF;
  IF OLD.inspection_version=1 AND ROW(NEW.entry_notes,NEW.equipment_type,NEW.user_id,NEW.branch_id) IS DISTINCT FROM ROW(OLD.entry_notes,OLD.equipment_type,OLD.user_id,OLD.branch_id) THEN RAISE EXCEPTION 'As condições originais de entrada não podem ser alteradas.'; END IF;
  -- Recorded exit identity/time must come from the server, never the caller.
  NEW.exit_checklist:=OLD.exit_checklist; NEW.exit_recorded_at:=OLD.exit_recorded_at; NEW.exit_recorded_by:=OLD.exit_recorded_by;
 END IF;
 IF TG_OP='INSERT' OR NEW.approval_notes IS DISTINCT FROM OLD.approval_notes OR NEW.status IS DISTINCT FROM OLD.status THEN
  exit_data:=partner_service_orders_private.parse_checklist(NEW.approval_notes,NEW.equipment_type,'saída');
  IF exit_data IS NOT NULL THEN
   IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Identifique o responsável pela vistoria.'; END IF;
   IF exit_data IS DISTINCT FROM NEW.exit_checklist THEN NEW.exit_recorded_at:=now(); NEW.exit_recorded_by:=auth.uid(); END IF;
   NEW.exit_checklist:=exit_data;
  ELSIF NEW.exit_checklist IS NOT NULL THEN RAISE EXCEPTION 'Mantenha o checklist de saída registrado nas observações.';
  END IF;
 END IF;
 IF NEW.status IN ('finalizada','entregue') AND NEW.exit_checklist IS NULL AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'Complete o checklist de saída antes de finalizar a OS.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_service_orders_private.guard_inspection_history() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER inspection_history BEFORE INSERT OR UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION partner_service_orders_private.guard_inspection_history();

COMMENT ON COLUMN public.service_orders.inspection_version IS '0: OS anterior à validação no servidor, sem aceite retroativo; 1: entrada e garantia registradas no servidor.';
COMMENT ON COLUMN public.service_orders.customer_acknowledged_by IS 'Operador que registrou a ciência informada do cliente; não representa assinatura digital do cliente.';

-- Preserve current authorization, financial and idempotency rules.
CREATE OR REPLACE FUNCTION public.create_service_order_once(p_request_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
      DECLARE
       actor uuid:=auth.uid();
        branch uuid:=(p_payload->>'branch_id')::uuid;
         company uuid;
          request partner_operations_private.operation_requests%ROWTYPE;
           customer uuid:=(p_payload->>'customer_id')::uuid;
            manual jsonb:=p_payload->'manual_customer';
             customer_name text;
              customer_email text;
               customer_address text;
                customer_phone text;
                 manual_name text;
                  labor numeric:=(p_payload->>'labor_total')::numeric;
                   total_parts numeric:=0;
                    item jsonb;
                     product public.partner_products%ROWTYPE;
                      qty integer;
                       price numeric;
                       BEGIN
                        company:=partner_operations_private.authorize_branch(branch,'os');
                         IF p_request_id IS NULL OR p_payload IS NULL THEN RAISE EXCEPTION 'OS sem identificação.'; END IF;
                          PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':service-order:'||p_request_id::text,0));
                           SELECT * INTO request FROM partner_operations_private.operation_requests WHERE actor_id=actor AND kind='service-order' AND request_id=p_request_id;
                            IF FOUND THEN
                              IF request.payload<>p_payload THEN RAISE EXCEPTION 'Esta tentativa já identifica outra OS.'; END IF;
                                RETURN (request.result->>'id')::uuid;
                                 END IF;
                                  PERFORM 1 FROM public.store_settings_v2 WHERE user_id=company FOR SHARE;
 IF p_payload ? 'warranty_terms' AND (jsonb_typeof(p_payload->'warranty_terms') IS DISTINCT FROM 'string' OR (p_payload->>'warranty_terms') IS DISTINCT FROM coalesce((SELECT service_warranty_terms FROM public.store_settings_v2 WHERE user_id=company),'')) THEN
  RAISE EXCEPTION 'O termo de garantia mudou. Recarregue a tela e confirme as condições antes de abrir a OS.' USING ERRCODE='22023';
 END IF;
 IF labor IS NULL OR labor::text IN ('NaN','Infinity','-Infinity') OR labor<0 OR labor<>round(labor,2) THEN RAISE EXCEPTION 'Mão de obra inválida.'; END IF;
                                   IF coalesce(length(trim(p_payload->>'equipment_type')),0)=0 AND coalesce(length(trim(p_payload->>'identification')),0)=0 AND coalesce(length(trim(p_payload->>'serial')),0)=0 THEN RAISE EXCEPTION 'Informe o equipamento.'; END IF;
                                    IF customer IS NOT NULL THEN
                                      IF manual IS NOT NULL THEN RAISE EXCEPTION 'Informe um cliente cadastrado ou um cliente manual, não ambos.'; END IF;
                                        SELECT name INTO customer_name FROM public.partner_customers WHERE id=customer AND user_id=company AND (branch_id IS NULL OR branch_id=branch);
                                          IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não autorizado nesta filial.'; END IF;
                                           ELSIF manual IS NOT NULL THEN
                                             IF jsonb_typeof(manual) IS DISTINCT FROM 'object' OR jsonb_typeof(manual->'name') IS DISTINCT FROM 'string' THEN
                                                RAISE EXCEPTION 'Dados do cliente manual inválidos.';
                                                  END IF;
                                                    manual_name:=nullif(btrim(manual->>'name'),'');
                                                      IF manual_name IS NULL OR length(manual_name)>200 THEN RAISE EXCEPTION 'Informe o nome do cliente (até 200 caracteres).'; END IF;
                                                        IF jsonb_typeof(manual->'email') NOT IN ('string','null') OR jsonb_typeof(manual->'address') NOT IN ('string','null') OR jsonb_typeof(manual->'phone') NOT IN ('string','null') THEN
                                                           RAISE EXCEPTION 'Dados do cliente manual inválidos.';
                                                             END IF;
                                                               customer_email:=nullif(btrim(manual->>'email'),'');
                                                                 customer_address:=nullif(btrim(manual->>'address'),'');
                                                                   customer_phone:=nullif(btrim(manual->>'phone'),'');
                                                                     IF length(customer_email)>320 OR length(customer_address)>1000 OR length(customer_phone)>50 THEN RAISE EXCEPTION 'Os dados do cliente excedem o limite permitido.'; END IF;
                                                                       IF customer_email IS NOT NULL AND customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'E-mail do cliente inválido.'; END IF;
                                                                         customer_name:=manual_name;
                                                                          END IF;
                                                                           IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')>100 THEN RAISE EXCEPTION 'Peças inválidas.'; END IF;
                                                                            INSERT INTO public.service_orders(id,user_id,branch_id,customer_id,customer_name,customer_email,customer_address,customer_phone,service_segment,equipment_type,equipment_identification,serial_number,accessories_left,physical_condition,entry_damage,entry_notes,labor_total,total,status_history)
                                                                             VALUES(p_request_id,company,branch,customer,coalesce(customer_name,''),customer_email,customer_address,customer_phone,coalesce(p_payload->>'segment','assistencia'),p_payload->>'equipment_type',p_payload->>'identification',p_payload->>'serial',p_payload->>'accessories',p_payload->>'condition',p_payload->>'damage',p_payload->>'notes',labor,labor,jsonb_build_array(jsonb_build_object('status','aberta','actor',actor,'at',now())));
                                                                              FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'product_id' LOOP
                                                                                IF (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) THEN RAISE EXCEPTION 'Quantidade deve ser inteira.'; END IF;
                                                                                  qty:=(item->>'quantity')::integer; price:=(item->>'unit_price')::numeric;
                                                                                    IF qty IS NULL OR qty<=0 OR price IS NULL OR price::text IN ('NaN','Infinity','-Infinity') OR price<0 OR price<>round(price,2) THEN RAISE EXCEPTION 'Peça com valor inválido.'; END IF;
                                                                                      IF item->>'product_id' IS NULL THEN
                                                                                         IF jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR length(btrim(item->>'name')) NOT BETWEEN 1 AND 200 OR qty>999 OR price>9999999.99 THEN RAISE EXCEPTION 'Peça manual: informe descrição, quantidade de 1 a 999 e preço válido.'; END IF;
                                                                                            INSERT INTO public.service_order_items(service_order_id,user_id,product_id,branch_id,product_name,quantity,unit_cost,unit_price,stock_consumed)
                                                                                                VALUES(p_request_id,company,NULL,branch,btrim(item->>'name'),qty,0,price,false);
                                                                                                   total_parts:=total_parts+price*qty;
                                                                                                      CONTINUE;
                                                                                                        END IF;
                                                                                                          SELECT * INTO product FROM public.partner_products WHERE id=(item->>'product_id')::uuid AND user_id=company AND branch_id=branch FOR UPDATE;
                                                                                                            IF NOT FOUND THEN RAISE EXCEPTION 'Produto não autorizado nesta filial.'; END IF;
                                                                                                              IF NOT coalesce(product.is_service,false) AND product.stock<qty THEN RAISE EXCEPTION 'Estoque insuficiente para %.',product.name; END IF;
                                                                                                                INSERT INTO public.service_order_items(service_order_id,user_id,product_id,branch_id,product_name,quantity,unit_cost,unit_price,stock_consumed)
                                                                                                                   VALUES(p_request_id,company,product.id,branch,product.name,qty,product.cost_price,price,NOT coalesce(product.is_service,false));
                                                                                                                     total_parts:=total_parts+price*qty;
                                                                                                                       IF NOT coalesce(product.is_service,false) THEN
                                                                                                                          UPDATE public.partner_products SET stock=stock-qty,updated_at=now() WHERE id=product.id;
                                                                                                                             INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id) VALUES(company,product.id,product.name,'saida',qty,'Uso em OS '||p_request_id::text,branch);
                                                                                                                               END IF;
                                                                                                                                END LOOP;
                                                                                                                                 UPDATE public.service_orders SET parts_total=total_parts,total=total_parts+labor,updated_at=now() WHERE id=p_request_id;
                                                                                                                                  INSERT INTO partner_operations_private.operation_requests VALUES(actor,'service-order',p_request_id,p_payload,jsonb_build_object('id',p_request_id),now());
                                                                                                                                   RETURN p_request_id;
                                                                                                                                   END $function$
;
CREATE OR REPLACE FUNCTION partner_cadastros_private.update_customer_profile(p_customer_id uuid, p_fields jsonb, p_operator_id uuid DEFAULT NULL::uuid, p_operator_pin text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE existing public.partner_customers%ROWTYPE; desired public.partner_customers%ROWTYPE; allowed jsonb; operator record;
BEGIN
 PERFORM partner_subscription_private.require_actor('cadastros');
 PERFORM partner_subscription_private.require_operator_module('cadastros',p_operator_id);
 SELECT * INTO existing FROM public.partner_customers WHERE id=p_customer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;

 IF auth.uid()=existing.user_id AND p_operator_id IS NOT NULL THEN
  -- The company owner may authorize a company operator with a valid PIN,
  -- including operators who also have their own login. Preserve their role.
  SELECT sp.user_id AS company_id,sp.id AS salesperson_id,sp.role,sp.branch_id
  INTO operator FROM public.partner_salespeople sp
  WHERE sp.id=p_operator_id AND sp.user_id=auth.uid() AND coalesce(sp.active,true)
   AND sp.pin_hash IS NOT NULL
   AND public.verify_partner_salesperson_pin(p_operator_pin,sp.pin_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
  IF operator.role<>'administrador' AND operator.branch_id IS NOT NULL
   AND operator.branch_id IS DISTINCT FROM coalesce(p_branch_id,existing.branch_id)
  THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
 ELSE
  SELECT * INTO operator FROM public.resolve_partner_operator(p_operator_id,p_operator_pin,coalesce(p_branch_id,existing.branch_id));
 END IF;

 IF existing.user_id<>operator.company_id OR (operator.role<>'administrador' AND existing.branch_id IS NOT NULL AND existing.branch_id IS DISTINCT FROM operator.branch_id)
 THEN RAISE EXCEPTION 'Cliente de outra empresa ou filial.'; END IF;
 IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dados do cliente inválidos.'; END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO allowed FROM jsonb_each(p_fields)
 WHERE key=ANY(ARRAY['branch_id','name','document','person_type','phone','email','birthday','address','neighborhood','city','device_model','notes','customer_type','credit_limit','allow_credit','trade_name','rg','municipal_registration','state_registration','ie_isento','suframa_id','sex','address_number','zip_code','state','complement','reference_point','country','salesperson_id','customer_group','price_table','convenio','simples_nacional','reter_iss','is_active','is_store_admin','phone_commercial_1','phone_commercial_2','photo_url']);
 SELECT * INTO desired FROM jsonb_populate_record(existing,allowed);
 -- Company-wide customers remain shared even when the form supplies its active branch.
 IF existing.branch_id IS NULL THEN desired.branch_id:=NULL; END IF;
 IF desired.branch_id IS DISTINCT FROM existing.branch_id AND
 (desired.branch_id IS NULL OR operator.role<>'administrador' OR NOT EXISTS(SELECT 1 FROM public.partner_branches b WHERE b.id=desired.branch_id AND b.user_id=existing.user_id))
 THEN RAISE EXCEPTION 'Filial do cliente não autorizada.'; END IF;
 desired.name:=trim(desired.name);
 IF desired.name IS NULL OR trim(desired.name)='' THEN RAISE EXCEPTION 'Nome obrigatório.'; END IF;
 IF desired.person_type IS NULL OR desired.person_type NOT IN ('PF','PJ') THEN RAISE EXCEPTION 'Tipo de pessoa inválido.'; END IF;
 IF nullif(desired.document,'') IS NOT NULL AND length(regexp_replace(desired.document,'[^0-9]','','g')) <> (CASE WHEN desired.person_type='PJ' THEN 14 ELSE 11 END)
 THEN RAISE EXCEPTION 'Documento incompatível com o tipo de pessoa.'; END IF;
 IF desired.credit_limit IS NULL OR desired.credit_limit<0 OR desired.credit_limit::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Limite de crédito inválido.'; END IF;
 IF desired.salesperson_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople sp WHERE sp.id=desired.salesperson_id AND sp.user_id=existing.user_id AND (sp.branch_id IS NULL OR sp.branch_id IS NOT DISTINCT FROM desired.branch_id))
 THEN RAISE EXCEPTION 'Vendedor de outra empresa ou filial.'; END IF;
 IF desired.photo_url IS DISTINCT FROM existing.photo_url AND desired.photo_url IS NOT NULL AND
 (split_part(desired.photo_url,'/',1)<>auth.uid()::text OR split_part(desired.photo_url,'/',2)<>p_customer_id::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='customer-photos' AND name=desired.photo_url))
 THEN RAISE EXCEPTION 'Foto do cliente inválida.'; END IF;
 UPDATE public.partner_customers SET branch_id=desired.branch_id,name=desired.name,document=desired.document,person_type=desired.person_type,phone=desired.phone,email=desired.email,birthday=desired.birthday,address=desired.address,neighborhood=desired.neighborhood,city=desired.city,device_model=desired.device_model,notes=desired.notes,customer_type=desired.customer_type,credit_limit=desired.credit_limit,allow_credit=desired.allow_credit,trade_name=desired.trade_name,rg=desired.rg,municipal_registration=desired.municipal_registration,state_registration=desired.state_registration,ie_isento=desired.ie_isento,suframa_id=desired.suframa_id,sex=desired.sex,address_number=desired.address_number,zip_code=desired.zip_code,state=desired.state,complement=desired.complement,reference_point=desired.reference_point,country=desired.country,salesperson_id=desired.salesperson_id,customer_group=desired.customer_group,price_table=desired.price_table,convenio=desired.convenio,simples_nacional=desired.simples_nacional,reter_iss=desired.reter_iss,is_active=desired.is_active,is_store_admin=desired.is_store_admin,phone_commercial_1=desired.phone_commercial_1,phone_commercial_2=desired.phone_commercial_2,photo_url=desired.photo_url
 WHERE id=existing.id AND user_id=operator.company_id RETURNING * INTO desired;
 RETURN jsonb_set(to_jsonb(desired),'{convenio}',to_jsonb(coalesce(desired.convenio,'false') IN ('true','sim','1')));
END $function$;

REVOKE ALL ON FUNCTION public.create_service_order_once(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_service_order_once(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION partner_cadastros_private.update_customer_profile(uuid,jsonb,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_cadastros_private.update_customer_profile(uuid,jsonb,uuid,text,uuid) TO authenticated;
