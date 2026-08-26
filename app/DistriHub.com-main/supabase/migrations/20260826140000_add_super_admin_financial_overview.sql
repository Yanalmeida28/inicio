CREATE OR REPLACE FUNCTION public.get_super_admin_financial_overview(input_password text)
RETURNS TABLE (
  month_label text,
  month_start date,
  revenue numeric,
  open_amount numeric,
  paid_count bigint,
  open_count bigint,
  active_clients bigint,
  average_ticket numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_super_admin(input_password) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(date_trunc('month', now())::date - interval '5 months', date_trunc('month', now())::date, interval '1 month')::date AS month_start
  ),
  invoice_data AS (
    SELECT date_trunc('month', created_at)::date AS month_start,
      SUM(CASE WHEN status = 'paga' THEN amount ELSE 0 END) AS revenue,
      SUM(CASE WHEN status <> 'paga' THEN amount ELSE 0 END) AS open_amount,
      COUNT(*) FILTER (WHERE status = 'paga') AS paid_count,
      COUNT(*) FILTER (WHERE status <> 'paga') AS open_count
    FROM public.partner_invoices
    GROUP BY 1
  ),
  clients AS (
    SELECT date_trunc('month', created_at)::date AS month_start, COUNT(*) AS active_clients
    FROM public.partner_profiles
    GROUP BY 1
  )
  SELECT to_char(months.month_start, 'Mon/YY'), months.month_start,
    COALESCE(invoice_data.revenue, 0), COALESCE(invoice_data.open_amount, 0),
    COALESCE(invoice_data.paid_count, 0), COALESCE(invoice_data.open_count, 0),
    COALESCE(clients.active_clients, 0),
    CASE WHEN COALESCE(invoice_data.paid_count, 0) > 0 THEN invoice_data.revenue / invoice_data.paid_count ELSE 0 END
  FROM months
  LEFT JOIN invoice_data USING (month_start)
  LEFT JOIN clients USING (month_start)
  ORDER BY months.month_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_financial_overview(text) TO anon, authenticated;
