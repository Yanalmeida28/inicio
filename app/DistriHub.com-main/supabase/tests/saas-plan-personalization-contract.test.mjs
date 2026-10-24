import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../migrations/20261024180000_enable_basic_os_and_tiered_personalization.sql', import.meta.url),
  'utf8',
);
const serviceOrdersModule = await readFile(
  new URL('../../src/components/partner/ServiceOrdersModule.tsx', import.meta.url),
  'utf8',
);
const saasLibrary = await readFile(
  new URL('../../src/lib/saas.ts', import.meta.url),
  'utf8',
);

test('local plan migration grants only the requested tier entitlements without changing subscription prices', () => {
  assert.match(migration, /plan\.id = 'basico'/);
  assert.match(migration, /ARRAY\['os', 'personalizacao_basica'\]/);
  assert.match(migration, /plan\.id IN \('profissional', 'enterprise'\)/);
  assert.match(migration, /'personalizacao_profissional'/);
  assert.match(migration, /'white-label'/);
  assert.doesNotMatch(migration, /UPDATE\s+public\.saas_subscriptions/i);
  assert.doesNotMatch(migration, /monthly_amount\s*=/i);
});

test('personalization tab uses active subscription access without requiring the Enterprise-only white-label feature', () => {
  assert.match(saasLibrary, /if \(feature === 'white-label'\)/);
  assert.match(saasLibrary, /subscription\?\.can_access === true/);
  assert.match(saasLibrary, /'basico', 'profissional', 'enterprise'/);
});

test('branding access is separated by plan and company settings remain owner-scoped', () => {
  assert.match(migration, /partner_has_saas_access\(company_id, 'personalizacao_basica'\)/);
  assert.match(migration, /partner_has_saas_access\(company_id, 'personalizacao_profissional'\)/);
  assert.match(migration, /partner_has_saas_access\(company_id, 'white-label'\)/);
  assert.match(migration, /company_id uuid := \(to_jsonb\(NEW\)->>'user_id'\)::uuid/);
  assert.match(migration, /RLS|auth\.uid\(\)/i);
});

test('warranty snapshots are captured only when creating orders and are not rewritten on edits', () => {
  assert.match(migration, /BEFORE INSERT ON public\.service_orders/);
  assert.match(migration, /settings\.service_warranty_terms/);
  assert.match(migration, /warranty_terms_snapshot/);
  assert.doesNotMatch(migration, /UPDATE\s+public\.service_orders\s+SET\s+warranty_terms_snapshot/i);
});

test('service-order edits check subscription, operator permission, tenant, and branch', () => {
  assert.match(migration, /require_access\(company_id, 'os'\)/);
  assert.match(migration, /require_operator_module\('os', p_operator_id\)/);
  assert.match(migration, /salesperson\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /WHERE id = p_service_order_id\s+AND user_id = company_id/);
  assert.match(migration, /existing_order\.branch_id IS DISTINCT FROM operator_branch_id/);
});

test('service-order printing includes company data, receipt logo, footer, saved warranty, and branch-scoped items', () => {
  assert.match(serviceOrdersModule, /storeSettings\.show_logo_on_receipt && storeSettings\.logo_url/);
  assert.match(serviceOrdersModule, /\.store-logo\{[^}]*max-width:50mm;[^}]*max-height:25mm/);
  assert.match(serviceOrdersModule, /companyProfile\?\.whatsapp/);
  assert.match(serviceOrdersModule, /storeSettings\.receipt_footer_text/);
  assert.match(serviceOrdersModule, /const warrantyTerms = order\.warranty_terms_snapshot/);
  assert.match(serviceOrdersModule, /\.eq\('user_id', userId\)[\s\S]*?\.eq\('branch_id', order\.branch_id\)[\s\S]*?\.eq\('service_order_id', order\.id\)/);
  assert.match(serviceOrdersModule, /const escapeHtml = \(value:/);
});
