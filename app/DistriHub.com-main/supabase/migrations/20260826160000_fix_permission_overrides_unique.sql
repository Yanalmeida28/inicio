CREATE UNIQUE INDEX IF NOT EXISTS partner_permission_overrides_user_salesperson_idx
  ON public.partner_permission_overrides(user_id, salesperson_id);
