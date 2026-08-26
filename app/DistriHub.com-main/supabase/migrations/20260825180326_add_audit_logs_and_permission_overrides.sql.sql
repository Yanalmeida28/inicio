/*
# Add Audit Trail & Permission Overrides

1. Purpose
   Adds an audit log table to track employee actions and a permission overrides
   table for granular per-employee privilege toggles.

2. New Tables
   - partner_audit_logs: action tracking with actor, action type, entity, details, timestamp
   - partner_permission_overrides: per-salesperson permission flags

3. Security
   - RLS enabled on both tables, TO authenticated
   - Users can only see/modify their own rows (auth.uid() = user_id)

4. Notes
   - Safe additive migration, no existing tables altered.
*/

CREATE TABLE IF NOT EXISTS partner_audit_logs (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_audit_logs" ON partner_audit_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_audit_logs" ON partner_audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_audit_logs" ON partner_audit_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_audit_logs" ON partner_audit_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS partner_permission_overrides (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salesperson_id text NOT NULL,
  can_cancel_sales boolean NOT NULL DEFAULT false,
  discount_override_limit numeric NOT NULL DEFAULT 0,
  can_view_cost_prices boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_perm_overrides" ON partner_permission_overrides FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_perm_overrides" ON partner_permission_overrides FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_perm_overrides" ON partner_permission_overrides FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_perm_overrides" ON partner_permission_overrides FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
