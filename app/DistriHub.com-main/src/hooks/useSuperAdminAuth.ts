import { useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type UseSuperAdminAuthReturn = {
  verifyPassword: (password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  requestRecovery: (email: string) => Promise<{ code: string | null; error: string | null }>;
  resetPassword: (code: string, newPassword: string) => Promise<{ error: string | null }>;
};

export function useSuperAdminAuth(): UseSuperAdminAuthReturn {
  const verifyPassword = useCallback(async (password: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) {
      return false;
    }
    const { data, error } = await supabase.rpc('verify_super_admin_password', {
      input_password: password,
    });
    if (error) return false;
    return data === true;
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false;
      const { data, error } = await supabase.rpc('change_super_admin_password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (error) return false;
      return data === true;
    },
    [],
  );

  const requestRecovery = useCallback(
    async (email: string): Promise<{ code: string | null; error: string | null }> => {
      if (!isSupabaseConfigured || !supabase) {
        return { code: null, error: 'Supabase não configurado.' };
      }
      const { data, error } = await supabase.rpc('request_super_admin_recovery', {
        input_email: email,
      });
      if (error) return { code: null, error: error.message };
      if (!data) return { code: null, error: 'Não foi possível iniciar a recuperação.' };
      return { code: null, error: 'A recuperação deve usar o canal seguro configurado.' };
    },
    [],
  );

  const resetPassword = useCallback(
    async (code: string, newPassword: string): Promise<{ error: string | null }> => {
      if (!isSupabaseConfigured || !supabase) {
        return { error: 'Supabase não configurado.' };
      }
      const { data, error } = await supabase.rpc('reset_super_admin_password', {
        recovery_code_input: code,
        new_password: newPassword,
      });
      if (error) return { error: error.message };
      if (!data) return { error: 'Código de recuperação inválido ou expirado.' };
      return { error: null };
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
