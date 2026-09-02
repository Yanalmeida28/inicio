import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ShoppingCart, Store, Tag, Image as ImageIcon } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { PartnerBranch, PartnerProduct, PartnerProfile, StoreSettings } from '../types';

const DEFAULT_CATALOG = {
  name: 'DistriHub',
  description: 'Catálogo público da loja.',
};

type PublicCatalogPageProps = {
  slug: string;
  branchSlug?: string | null;
};

type CatalogRecord = {
  user_id: string;
  business_name?: string | null;
  catalog_slug?: string | null;
  catalog_enabled?: boolean;
  logo_url?: string | null;
  banner_url?: string | null;
  primary_color?: string;
  nav_color?: string;
  name?: string;
  business_hours?: string | null;
};

export function PublicCatalogPage({ slug, branchSlug }: PublicCatalogPageProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [branch, setBranch] = useState<PartnerBranch | null>(null);
  const [products, setProducts] = useState<PartnerProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCatalog() {
      if (!isSupabaseConfigured || !supabase || !slug) {
        setError('Catálogo indisponível no momento.');
        setLoading(false);
        return;
      }

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('partner_profiles')
          .select('*')
          .eq('business_name', slug)
          .maybeSingle();

        const normalizedSlug = slug.trim().toLowerCase();

        let resolvedUserId: string | null = null;
        let resolvedSettings: StoreSettings | null = null;

        if (!profileError && profileData) {
          resolvedUserId = profileData.id;
        } else {
          const { data: settingsData, error: settingsError } = await supabase
            .from('store_settings_v2')
            .select('*')
            .ilike('catalog_slug', normalizedSlug)
            .maybeSingle();

          if (!settingsError && settingsData) {
            resolvedUserId = settingsData.user_id;
            resolvedSettings = settingsData as StoreSettings;
          }
        }

        if (!resolvedUserId) {
          setError('Loja não encontrada.');
          setLoading(false);
          return;
        }

        const { data: settingsData, error: settingsError } = await supabase
          .from('store_settings_v2')
          .select('*')
          .eq('user_id', resolvedUserId)
          .maybeSingle();

        if (!settingsError && settingsData) {
          resolvedSettings = settingsData as StoreSettings;
        }

        if (!resolvedSettings?.catalog_enabled) {
          setError('Este catálogo está indisponível no momento.');
          setLoading(false);
          return;
        }

        if (!settingsError && settingsData) {
          const { data: profileRecord, error: profileLookupError } = await supabase
            .from('partner_profiles')
            .select('*')
            .eq('id', resolvedUserId)
            .maybeSingle();

          if (!profileLookupError && profileRecord) {
            setProfile(profileRecord as PartnerProfile);
          }
        }

        if (branchSlug) {
          const { data: branchData } = await supabase
            .from('partner_branches')
            .select('*')
            .eq('user_id', resolvedUserId)
            .ilike('name', branchSlug)
            .maybeSingle();

          if (branchData) {
            setBranch(branchData as PartnerBranch);
          }
        }

        let query = supabase
          .from('partner_products')
          .select('*')
          .eq('user_id', resolvedUserId)
          .eq('is_service', false)
          .gt('stock', 0);

        if (branchSlug && branch) {
          query = query.eq('branch_id', branch.id);
        } else if (branchSlug) {
          query = query.eq('branch_id', '00000000-0000-0000-0000-000000000000');
        }

        const { data: productData, error: productError } = await query.order('created_at', { ascending: false });

        if (productError) {
          setError(productError.message);
          setLoading(false);
          return;
        }

        setSettings(resolvedSettings ?? null);
        setProducts((productData ?? []) as PartnerProduct[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar catálogo.');
      } finally {
        setLoading(false);
      }
    }

    loadCatalog();
  }, [branch, branchSlug, slug]);

  const primaryBrandName = profile?.name ?? settings?.user_id ? 'Loja' : DEFAULT_CATALOG.name;
  const logoUrl = settings?.logo_url ?? null;
  const summary = useMemo(() => ({
    title: primaryBrandName,
    address: branch?.address ?? settings?.internal_notice ?? DEFAULT_CATALOG.description,
  }), [branch, primaryBrandName, settings]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center' }}>Carregando catálogo...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Catálogo indisponível</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', color: '#172033', fontFamily: 'sans-serif' }}>
      <header style={{ background: settings?.nav_color ?? '#0b1927', color: '#fff', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoUrl ? <img src={logoUrl} alt={summary.title} style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} /> : <Store size={26} />}
            <div>
              <strong style={{ display: 'block', fontSize: 22 }}>{summary.title}</strong>
              <small>{branch ? branch.name : 'Catálogo público'}</small>
            </div>
          </div>
          <div style={{ opacity: 0.9, fontSize: 13 }}>{settings?.business_hours ?? 'Atendimento conforme disponibilidade da loja'}</div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px 48px' }}>
        {settings?.banner_url && (
          <div style={{ marginBottom: 24, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}>
            <img src={settings.banner_url} alt="Banner da loja" style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Identidade da loja</strong>
            <div style={{ fontSize: 14, color: '#475569' }}>{summary.address}</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Produtos ativos</strong>
            <div style={{ fontSize: 14, color: '#475569' }}>{products.length} itens disponíveis</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {products.map((product) => (
            <article key={product.id} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
              <div style={{ position: 'relative', background: '#eef2ff', minHeight: 180 }}>
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: 180, display: 'grid', placeItems: 'center', color: '#64748b' }}><ImageIcon size={36} /></div>
                )}
                <span style={{ position: 'absolute', top: 12, left: 12, background: '#0f172a', color: '#fff', fontSize: 11, borderRadius: 999, padding: '6px 10px' }}>
                  {product.category ?? 'Produto'}
                </span>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontSize: 18 }}>{product.name}</strong>
                  <span style={{ fontSize: 12, color: '#64748b' }}>SKU {product.sku ?? 'N/A'}</span>
                </div>
                <p style={{ color: '#475569', minHeight: 48, margin: '8px 0 14px' }}>{product.category ?? 'Produto da loja'}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <strong style={{ color: '#0f172a', fontSize: 22 }}>R$ {Number(product.sale_price ?? 0).toFixed(2).replace('.', ',')}</strong>
                  <span style={{ color: product.stock > 0 ? '#0f766e' : '#b91c1c', fontSize: 12, fontWeight: 700 }}>
                    {product.stock > 0 ? `${product.stock} em estoque` : 'Indisponível'}
                  </span>
                </div>
                <button style={{ width: '100%', border: 'none', background: settings?.primary_color ?? '#3193e5', color: '#fff', borderRadius: 10, padding: '12px 14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ShoppingCart size={16} /> Adicionar ao pedido
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
