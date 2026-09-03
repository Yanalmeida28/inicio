import { useCallback, useEffect, useReducer } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { PartnerIdentity, PartnerProfile, PartnerSalesperson } from '../types';

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: PartnerProfile | null;
  identity: PartnerIdentity | null;
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

type AuthAction =
  | { type: 'RESET' }
  | { type: 'SET_SESSION'; session: Session | null; user: User | null; passwordRecovery?: boolean }
  | { type: 'SET_PROFILE'; profile: PartnerProfile | null }
  | { type: 'SET_IDENTITY'; identity: PartnerIdentity | null }
  | { type: 'SET_ERROR'; error: string | null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESET':
      return {
        session: null,
        user: null,
        profile: null,
        identity: null,
        loading: false,
        error: null,
        passwordRecovery: false,
      };
    case 'SET_SESSION':
      return {
        ...state,
        session: action.session,
        user: action.user,
        loading: false,
        passwordRecovery: action.passwordRecovery ?? state.passwordRecovery,
      };
    case 'SET_PROFILE':
      return {
        ...state,
        profile: action.profile,
      };
    case 'SET_IDENTITY':
      return { ...state, identity: action.identity };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

export function useAuth(): UseAuthReturn {
  const [state, dispatch] = useReducer(authReducer, {
    session: null,
    user: null,
    profile: null,
    identity: null,
    loading: true,
    error: null,
    passwordRecovery: false,
  });

  const resolveIdentity = useCallback(async (authUserId: string): Promise<PartnerIdentity> => {
    if (!supabase) {
      throw new Error('Supabase não configurado; não foi possível resolver a identidade do usuário.');
    }

    const { data, error } = await supabase
      .from('partner_salespeople')
      .select('id, user_id, role, branch_id')
      .eq('auth_user_id', authUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Não foi possível resolver a identidade do usuário: ${error.message}`);
    }

    const salesperson = data as Pick<PartnerSalesperson, 'id' | 'user_id' | 'role' | 'branch_id'> | null;
    if (salesperson) {
      if (!salesperson.user_id) {
        throw new Error('O vínculo do funcionário não possui uma empresa válida.');
      }

      return {
        authUserId,
        companyUserId: salesperson.user_id,
        role: salesperson.role,
        salespersonId: salesperson.id,
        branchId: salesperson.branch_id ?? null,
      };
    }

    const { data: ownerProfile, error: ownerError } = await supabase
      .from('partner_profiles')
      .select('id')
      .eq('id', authUserId)
      .limit(1)
      .maybeSingle();

    if (ownerError) {
      throw new Error(`Não foi possível validar a identidade do proprietário: ${ownerError.message}`);
    }
    if (!ownerProfile) {
      throw new Error('Usuário autenticado não possui vínculo de proprietário ou funcionário.');
    }

    return { authUserId, companyUserId: authUserId, role: 'administrador', salespersonId: null, branchId: null };
  }, []);

  const loadProfile = useCallback(async (userId: string): Promise<PartnerProfile | null> => {
    if (!supabase) return null;

    const { data: profile, error } = await supabase
      .from('partner_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Não foi possível carregar o perfil da empresa: ${error.message}`);
    }

    return profile as PartnerProfile | null;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      dispatch({ type: 'RESET' });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      dispatch({
        type: 'SET_SESSION',
        session,
        user: session?.user ?? null,
      });

      if (session?.user) {
        dispatch({ type: 'SET_IDENTITY', identity: null });
        dispatch({ type: 'SET_PROFILE', profile: null });
        dispatch({ type: 'SET_ERROR', error: null });
        resolveIdentity(session.user.id)
          .then(async (identity) => {
            dispatch({ type: 'SET_IDENTITY', identity });
            dispatch({ type: 'SET_PROFILE', profile: await loadProfile(identity.companyUserId) });
          })
          .catch((error: unknown) => {
            dispatch({ type: 'SET_ERROR', error: error instanceof Error ? error.message : 'Não foi possível resolver a identidade do usuário.' });
          });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      dispatch({
        type: 'SET_SESSION',
        session,
        user: session?.user ?? null,
        passwordRecovery: _event === 'PASSWORD_RECOVERY',
      });

      if (session?.user) {
        dispatch({ type: 'SET_IDENTITY', identity: null });
        dispatch({ type: 'SET_PROFILE', profile: null });
        dispatch({ type: 'SET_ERROR', error: null });
        try {
          const identity = await resolveIdentity(session.user.id);
          dispatch({ type: 'SET_IDENTITY', identity });
          const profile = await loadProfile(identity.companyUserId);
          dispatch({ type: 'SET_PROFILE', profile });
        } catch (error) {
          dispatch({ type: 'SET_ERROR', error: error instanceof Error ? error.message : 'Não foi possível resolver a identidade do usuário.' });
        }
      } else {
        dispatch({ type: 'SET_PROFILE', profile: null });
        dispatch({ type: 'SET_IDENTITY', identity: null });
        dispatch({ type: 'SET_ERROR', error: null });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile, resolveIdentity]);

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

    const { data: client, error: clientError } = await supabase
      .from('admin_lojistas')
      .select('status')
      .eq('user_id', data.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (clientError) {
      console.error('Não foi possível verificar o status do lojista durante o login.', clientError);
    }
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
