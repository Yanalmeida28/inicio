BEGIN;
-- A manual OS customer is an invoice snapshot, not a credit-account customer.
-- Keep approval, branch authorization, financial permission and replay guards.
DO $billing$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.bill_service_order_once(uuid,date)'::regprocedure);
 IF position('OR o.customer_id IS NULL OR o.total<=0' IN definition)=0 THEN RAISE EXCEPTION 'OS billing changed; review manual customer support'; END IF;
 definition:=replace(definition,'OR o.customer_id IS NULL OR o.total<=0', 'OR (o.customer_id IS NULL AND coalesce(length(btrim(o.customer_name)),0)=0) OR o.total<=0');
 EXECUTE definition;
END $billing$;

CREATE FUNCTION partner_service_orders_private.clear_changed_customer_contact() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 NEW.customer_email:=NULL;
 NEW.customer_address:=NULL;
 NEW.customer_phone:=NULL;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION partner_service_orders_private.clear_changed_customer_contact() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER service_order_customer_contact_changed BEFORE UPDATE OF customer_id ON public.service_orders
FOR EACH ROW WHEN (OLD.customer_id IS DISTINCT FROM NEW.customer_id)
EXECUTE FUNCTION partner_service_orders_private.clear_changed_customer_contact();
NOTIFY pgrst,'reload schema';
COMMIT;
