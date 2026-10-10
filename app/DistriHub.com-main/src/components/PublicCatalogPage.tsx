import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, Store, MessageCircle, Image as ImageIcon } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { contrastText, normalizeColor } from '../lib/storeTheme';
import type { PartnerProduct } from '../types';
import { catalogPreferences, catalogWhatsappUrl } from '../lib/personalization';

const DEFAULT_CATALOG = {
  name: 'DistriHub',
  description: 'Catálogo público da loja.',
};

type PublicCatalogPageProps = {
  slug: string;
  branchSlug?: string | null;
};

type PublicStoreSettings = {
  catalog_preferences?: unknown;
  catalog_slug: string | null;
  catalog_enabled: boolean;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string | null;
  nav_color: string | null;
  business_hours: string | null;
};

type PublicPartnerProfile = {
  business_name: string;
  account_name: string | null;
};

type PublicPartnerBranch = {
  id: string;
  name: string;
  address: string | null;
};

type PublicCatalogProduct = Pick<PartnerProduct, 'id' | 'branch_id' | 'name' | 'sale_price' | 'image_url' | 'stock' | 'category' | 'sku' | 'is_service'>;

export function PublicCatalogPage({ slug, branchSlug }: PublicCatalogPageProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicPartnerProfile | null>(null);
  const [settings, setSettings] = useState<PublicStoreSettings | null>(null);
  const [branch, setBranch] = useState<PublicPartnerBranch | null>(null);
  const [products, setProducts] = useState<PublicCatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      setLoading(true); setError(null); setBranch(null);
      if (!isSupabaseConfigured || !supabase || !slug) {
        setError('Catálogo indisponível no momento.'); setLoading(false); return;
      }
      try {
        const { data, error: catalogError } = await supabase.rpc('read_public_store_catalog', { p_slug: slug, p_branch_slug: branchSlug ?? null });
        if (catalogError) throw new Error(catalogError.message);
        if (!active) return;
        if (!data) { setError('Este catálogo está indisponível no momento.'); return; }
        const catalog = data as { settings: PublicStoreSettings; profile: PublicPartnerProfile | null; branch: PublicPartnerBranch | null; products: PublicCatalogProduct[] };
        setSettings(catalog.settings); setProfile(catalog.profile); setBranch(catalog.branch); setProducts(catalog.products);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Erro ao carregar catálogo.');
      } finally { if (active) setLoading(false); }
    }
    void loadCatalog();
    return () => { active = false; };
  }, [branchSlug, slug]);

  const primaryBrandName = profile?.business_name ?? profile?.account_name ?? 'Loja';
  const logoUrl = settings?.logo_url ?? null;
  const preferences = catalogPreferences(settings?.catalog_preferences);
  const whatsappUrl = preferences.show_whatsapp ? catalogWhatsappUrl(preferences.whatsapp_phone) : null;
  const summary = useMemo(() => ({
    title: primaryBrandName,
    address: branch?.address ?? DEFAULT_CATALOG.description,
  }), [branch, primaryBrandName]);

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
    <div style={{ minHeight: '100vh', background: '#102638', color: '#edf5fc', fontFamily: 'sans-serif' }}>
      <header style={{ background: normalizeColor(settings?.nav_color, '#0b1927'), color: contrastText(normalizeColor(settings?.nav_color, '#0b1927')), padding: '20px 24px' }}>
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
            <img src={settings.banner_url} alt="Banner da loja" style={{ width: '100%', height: preferences.banner_height, objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
          <div style={{ background: '#102638', borderRadius: 16, padding: 18, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Identidade da loja</strong>
            <div style={{ fontSize: 14, color: '#adc2d6' }}>{summary.address}</div>
          </div>
          <div style={{ background: '#102638', borderRadius: 16, padding: 18, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Produtos ativos</strong>
            <div style={{ fontSize: 14, color: '#adc2d6' }}>{products.length} itens disponíveis</div>
          </div>
        </div>

        {preferences.welcome_message && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '16px 20px', background: '#102638', borderRadius: 12 }}>{preferences.welcome_message}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${preferences.card_size === 'compact' ? 220 : 280}px), 1fr))`, gap: preferences.card_size === 'compact' ? 12 : 20 }}>
          {products.map((product) => (
            <article key={product.id} style={{ background: '#102638', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
              <div style={{ position: 'relative', background: '#132f4d', minHeight: 180 }}>
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: 180, display: 'grid', placeItems: 'center', color: '#adc2d6' }}><ImageIcon size={36} /></div>
                )}
                <span style={{ position: 'absolute', top: 12, left: 12, background: '#0f172a', color: '#fff', fontSize: 11, borderRadius: 999, padding: '6px 10px' }}>
                  {product.category ?? 'Produto'}
                </span>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontSize: 18 }}>{product.name}</strong>
                  {preferences.show_sku && <span style={{ fontSize: 12, color: '#adc2d6' }}>SKU {product.sku ?? 'N/A'}</span>}
                </div>
                <p style={{ color: '#adc2d6', minHeight: 48, margin: '8px 0 14px' }}>{product.category ?? 'Produto da loja'}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <strong style={{ color: '#edf5fc', fontSize: 22 }}>R$ {Number(product.sale_price ?? 0).toFixed(2).replace('.', ',')}</strong>
                  {preferences.show_stock && <span style={{ color: product.stock > 0 ? '#adc2d6' : '#fda4af', fontSize: 12, fontWeight: 700 }}>
                    {product.stock > 0 ? `${product.stock} em estoque` : 'Indisponível'}
                  </span>}
                </div>
                <button style={{ width: '100%', border: 'none', background: normalizeColor(settings?.primary_color), color: contrastText(normalizeColor(settings?.primary_color)), borderRadius: 10, padding: '12px 14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ShoppingCart size={16} /> Adicionar ao pedido
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
      {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ position: 'fixed', right: 20, bottom: 20, display: 'flex', gap: 8, alignItems: 'center', background: '#15803d', color: '#fff', padding: '12px 18px', borderRadius: 24, boxShadow: '0 4px 16px #0003' }}><MessageCircle size={20} /> Falar com a loja</a>}
    </div>
  );
}
