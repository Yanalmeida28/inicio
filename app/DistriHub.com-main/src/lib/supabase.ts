import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Sessão persistida no storage PADRÃO do Supabase (localStorage).
// Antes usávamos sessionStorage, o que fazia a sessão JWT se perder ao abrir
// outra aba ou em determinados reloads — a UI continuava com `identity` no
// estado React, mas a RPC saía sem sessão (anon), gerando 401/404.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'distrihub-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;