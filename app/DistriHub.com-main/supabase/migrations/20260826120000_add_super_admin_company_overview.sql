/* Full company overview for the password-protected Super Admin panel. */

CREATE OR REPLACE FUNCTION public.get_super_admin_company_overview(input_password text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  business_name text,
  account_name text,
  document text,
  whatsapp text,
  segment text,
  subscription_plan text,
  subscription_status text,
  next_billing_date date,
  payment_method text,
  client_status text,
  credit_limit numeric,
  credit_used numeric,
  orders_count bigint,
  orders_total numeric,
  last_order_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
BEGIN
  IF NOT public.verify_super_admin(input_password) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    profile.id AS user_id,
    auth_user.email::text,
    profile.business_name,
    profile.account_name,
    profile.document,
    profile.whatsapp,
    profile.segment,
    profile.subscription_plan,
    profile.subscription_status,
    profile.next_billing_date,
    profile.payment_method,
    COALESCE(admin_client.status, 'pendente') AS client_status,
    COALESCE(admin_client.credit_limit, 0) AS credit_limit,
    COALESCE(admin_client.credit_used, 0) AS credit_used,
    COUNT(order_row.id)::bigint AS orders_count,
    COALESCE(SUM(order_row.total), 0)::numeric AS orders_total,
    MAX(order_row.created_at) AS last_order_at,
    profile.created_at
  FROM public.partner_profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.id
  LEFT JOIN public.admin_lojistas admin_client ON admin_client.user_id = profile.id
  LEFT JOIN public.b2b_orders order_row ON order_row.user_id = profile.id
  GROUP BY profile.id, auth_user.email, profile.business_name, profile.account_name,
    profile.document, profile.whatsapp, profile.segment, profile.subscription_plan,
    profile.subscription_status, profile.next_billing_date, profile.payment_method,
    admin_client.status, admin_client.credit_limit, admin_client.credit_used,
    profile.created_at
  ORDER BY profile.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_company_overview(text) TO anon, authenticated;
