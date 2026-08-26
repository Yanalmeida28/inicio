import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { PartnerProfile, BusinessSegment } from '../types';

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: PartnerProfile | null;
  loading: boolean;
  error: string | null;
  passwordRecovery: boolean;
};

type SignUpData = {
  businessName: string;
  whatsapp: string;
  email: string;
  password: string;
};

type UseAuthReturn = AuthState & {
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
};

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
    error: null,
    passwordRecovery: false,
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setState({ session: null, user: null, profile: null, loading: false, error: null, passwordRecovery: false });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setState((prev) => ({
        ...prev,
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      }));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setState((prev) => ({
          ...prev,
          session,
          user: session?.user ?? null,
          loading: false,
          passwordRecovery: _event === 'PASSWORD_RECOVERY',
        }));

        if (session?.user) {
          const { data: profile } = await supabase!
            .from('partner_profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          setState((prev) => ({ ...prev, profile: profile as PartnerProfile | null }));
        } else {
          setState((prev) => ({ ...prev, profile: null }));
        }
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (data: SignUpData): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured || !supabase) return { error: 'Supabase não configurado.' };

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (error) return { error: error.message };
    if (!authData.user) return { error: 'Falha ao criar conta.' };

    await supabase.from('partner_profiles').insert({
      id: authData.user.id,
      business_name: data.businessName,
      whatsapp: data.whatsapp,
      segment: 'assistencia',
    });

    return { error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured || !supabase) return { error: 'Supabase não configurado.' };

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    const { data: client } = await supabase
      .from('admin_lojistas')
      .select('status')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (client?.status === 'reprovado') {
      await supabase.auth.signOut();
      return { error: 'Acesso bloqueado pelo administrador da plataforma.' };
    }

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    await supabase.auth.signOut();
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured || !supabase) return { error: 'Supabase não configurado.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured || !supabase) return { error: 'Supabase não configurado.' };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  return { ...state, signUp, signIn, signOut, requestPasswordReset, updatePassword };
}
