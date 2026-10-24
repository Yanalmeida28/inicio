import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

type DraftContextValue = {
  scope: string;
  reportError: (message: string) => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);
const memoryDrafts = new Map<string, unknown>();

export function SessionDraftProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [error, setError] = useState<{ scope: string; message: string } | null>(null);
  const reportError = useCallback((message: string) => setError({ scope, message }), [scope]);
  const context = useMemo<DraftContextValue>(() => ({scope, reportError}), [scope, reportError]);

  return (
    <DraftContext.Provider value={context}>
      {children}
      {error?.scope === scope && (
        <div role="alert" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2000, maxWidth: 420, padding: 12, borderRadius: 8, background: '#342b1b', color: '#fbbf24' }}>
          O rascunho não pôde ser mantido no navegador. Seus dados continuam nesta tela; use Salvar para gravar o cadastro.
          <small style={{ display: 'block', marginTop: 6 }}>{error.message}</small>
          <button type="button" aria-label="Fechar aviso de rascunho" onClick={() => setError(null)} style={{ marginTop: 8, color: '#fff', background: 'transparent', border: '1px solid #b98723', borderRadius: 4, padding: '4px 8px' }}>Fechar aviso</button>
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
export function useSessionDraftState<T>(draftId: string, initialValue: T, scopeOverride?: string, validate?: (value: unknown) => boolean): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(DraftContext);
  const scope = scopeOverride ?? context?.scope ?? 'unscoped';
  const storageKey = `distrihub:draft:${scope}:${draftId}`;
  function readDraft() {
    try {
      const value = window.sessionStorage.getItem(storageKey);
      const parsed: unknown = value === null ? memoryDrafts.get(storageKey) ?? initialValue : JSON.parse(value);
      const valid = validate ? validate(parsed) : initialValue === null ? parsed === null || typeof parsed === 'object'
        : Array.isArray(initialValue) ? Array.isArray(parsed)
        : typeof parsed === typeof initialValue && (typeof initialValue !== 'object' || (parsed !== null && !Array.isArray(parsed)));
      if (!valid) throw new Error('Rascunho incompatível; o formulário foi recuperado com os valores iniciais.');
      return {storageKey, value: parsed as T, error: null};
    } catch (error) {
      return {
        storageKey,
        value: (memoryDrafts.get(storageKey) ?? initialValue) as T,
        error: error instanceof Error ? error.message : 'Erro ao ler o armazenamento temporário.',
      };
    }
  }
  const [stored, setStored] = useState(readDraft);
  const current = stored.storageKey === storageKey ? stored : readDraft();
  if (stored.storageKey !== storageKey) setStored(current);
  const value = current.value;
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    setStored(previous => {
      if (previous.storageKey !== storageKey) return previous;
      return {...previous, error: null, value: typeof update === 'function'
        ? (update as (previous: T) => T)(previous.value) : update};
    });
  }, [storageKey]);

  useEffect(() => {
    if (!current.error) return;
    if (context) context.reportError(current.error);
    else console.error('Não foi possível recuperar o rascunho da sessão.', current.error);
  }, [context, current.error]);

  useEffect(() => {
    if (stored.storageKey !== storageKey) return;
    memoryDrafts.set(storageKey, value);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gravar o armazenamento temporário.';
      if (context) context.reportError(message);
      else console.error('Não foi possível salvar o rascunho da sessão.', message);
    }
  }, [context, storageKey, value, stored.storageKey]);

  return [value, setValue];
}
