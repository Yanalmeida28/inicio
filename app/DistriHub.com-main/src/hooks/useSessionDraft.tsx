import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

type DraftContextValue = {
  scope: string;
  reportError: (message: string) => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);

export function SessionDraftProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const context = useRef<DraftContextValue>({
    scope,
    reportError: (message) => setError(message),
  });
  context.current.scope = scope;
  context.current.reportError = (message) => setError(message);

  return (
    <DraftContext.Provider value={context.current}>
      {children}
      {error && (
        <div role="alert" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2000, maxWidth: 420, padding: 12, borderRadius: 8, background: '#7f1d1d', color: '#fff' }}>
          Não foi possível salvar o rascunho neste navegador: {error}
        </div>
      )}
    </DraftContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionDraftScope(): string {
  return useContext(DraftContext)?.scope ?? 'unscoped';
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionDraftState<T>(draftId: string, initialValue: T, scopeOverride?: string): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(DraftContext);
  const scope = scopeOverride ?? context?.scope ?? 'unscoped';
  const storageKey = `distrihub:draft:${scope}:${draftId}`;
  const [stored] = useState(() => {
    try {
      const value = window.sessionStorage.getItem(storageKey);
      return value === null ? { value: initialValue, error: null } : { value: JSON.parse(value) as T, error: null };
    } catch (error) {
      return {
        value: initialValue,
        error: error instanceof Error ? error.message : 'Erro ao ler o armazenamento temporário.',
      };
    }
  });
  const [value, setValue] = useState<T>(stored.value);

  useEffect(() => {
    if (!stored.error) return;
    if (context) context.reportError(stored.error);
    else console.error('Não foi possível recuperar o rascunho da sessão.', stored.error);
  }, [context, stored.error]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gravar o armazenamento temporário.';
      if (context) context.reportError(message);
      else console.error('Não foi possível salvar o rascunho da sessão.', message);
    }
  }, [context, storageKey, value]);

  return [value, setValue];
}
