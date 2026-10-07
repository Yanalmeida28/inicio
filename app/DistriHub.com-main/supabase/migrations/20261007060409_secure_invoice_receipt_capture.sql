-- The calling receipt/sale RPC already authorizes the mutation and supplies
-- its privileges to the trigger. Direct client writes cannot forge history.
ALTER FUNCTION public.capture_partner_invoice_receipt() SECURITY INVOKER;
