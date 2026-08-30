import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcxefjgchxhvcfppglvp.supabase.co';
// Cole a chave anon public exata do painel entre as aspas abaixo:
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjeGVmamdjaHhodmNmcHBnbHZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MzcxOTYsImV4cCI6MjEwMzAxMzE5Nn0.uMdunSQB9ctMcg_tc-ZhLZ6bAEnR0sABeLbYR7MP-Hg';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'distrihub-auth',
        storage: {
          getItem: (key: string) => sessionStorage.getItem(key),
          setItem: (key: string, value: string) => sessionStorage.setItem(key, value),
          removeItem: (key: string) => sessionStorage.removeItem(key),
        },
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;