import { useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type UseSuperAdminAuthReturn = {
  verifyPassword: (email: string, password: string) => Promise<{ ok: boolean; error: string | null }>;
  changePassword: (newPassword: string) => Promise<boolean>;
  requestRecovery: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (newPassword: string) => Promise<{ error: string | null }>;
};

export function useSuperAdminAuth(): UseSuperAdminAuthReturn {
  const verifyPassword = useCallback(async (email: string, password: string): Promise<{ ok: boolean; error: string | null }> => {
    if (!isSupabaseConfigured || !supabase) {
      return { ok: false, error: 'Supabase não configurado.' };
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        return { ok: false, error: signInError.message };
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        await supabase.auth.signOut();
        return { ok: false, error: 'Sessão do super admin inválida.' };
      }

      const { data: isSuperAdmin, error: authError } = await supabase.rpc('is_super_admin');
      if (authError || isSuperAdmin !== true) {
        await supabase.auth.signOut();
        return { ok: false, error: 'Operador não autorizado para o painel master.' };
      }

      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Não foi possível validar a credencial.' };
    }
  }, []);

  const changePassword = useCallback(
    async (newPassword: string): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false;
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return !error;
    },
    [],
  );

  const requestRecovery = useCallback(
    async (email: string): Promise<{ error: string | null }> => {
      if (!isSupabaseConfigured || !supabase) {
        return { error: 'Supabase não configurado.' };
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const resetPassword = useCallback(
    async (newPassword: string): Promise<{ error: string | null }> => {
      if (!isSupabaseConfigured || !supabase) {
        return { error: 'Supabase não configurado.' };
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error: error?.message ?? null };
    },
    [],
  );

  return { verifyPassword, changePassword, requestRecovery, resetPassword };
}

export function useRecoveryState() {
  const [step, setStep] = useState<'request' | 'verify' | 'done'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return {
    step, setStep,
    email, setEmail,
    code, setCode,
    newPassword, setNewPassword,
    generatedCode, setGeneratedCode,
    loading, setLoading,
    error, setError,
    success, setSuccess,
  };
}
