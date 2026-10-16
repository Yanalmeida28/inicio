import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

type DraftContextValue = {
  scope: string;
  legacyScope?: string;
  reportError: (message: string) => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);
const memoryDrafts = new Map<string, unknown>();

// Called only after confirmation. It deliberately leaves other forms and branches intact.
// eslint-disable-next-line react-refresh/only-export-components
export function clearConfirmedPdvDraft(scope: string, kind: 'checkout' | 'presale') {
  // Old operator drafts must never resurrect an already confirmed workspace.
  const clearedKey = `distrihub:draft-cleared:${scope}:${kind}`;
  memoryDrafts.set(clearedKey, true);
  window.sessionStorage.setItem(clearedKey, 'true');
  const prefix = `distrihub:draft:${scope}:${kind}:`;
  const keys = new Set([...memoryDrafts.keys()].filter(key => key.startsWith(prefix)));
  for (let index = 0; index < window.sessionStorage.length; index++) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(prefix)) keys.add(key);
  }
  for (const key of keys) {
    window.sessionStorage.removeItem(key);
    memoryDrafts.delete(key);
  }
}

export function SessionDraftProvider({ scope, legacyScope, children }: { scope: string; legacyScope?: string; children: ReactNode }) {
  const [error, setError] = useState<{ scope: string; message: string } | null>(null);
  const reportError = useCallback((message: string) => setError({ scope, message }), [scope]);
  const context = useMemo<DraftContextValue>(() => ({scope, legacyScope, reportError}), [scope, legacyScope, reportError]);

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
export function useSessionDraftScope(legacy = false): string {
  const context = useContext(DraftContext);
  return (legacy ? context?.legacyScope ?? context?.scope : context?.scope) ?? 'unscoped';
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionDraftState<T>(draftId: string, initialValue: T, scopeOverride?: string, validate?: (value: unknown) => boolean): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(DraftContext);
  const scope = scopeOverride ?? context?.scope ?? 'unscoped';
  const storageKey = `distrihub:draft:${scope}:${draftId}`;
  function readDraft() {
    try {
      const legacyKey = !scopeOverride && context?.legacyScope ? `distrihub:draft:${context.legacyScope}:${draftId}` : null;
      const currentValue = window.sessionStorage.getItem(storageKey);
      const hasCurrentDraft = currentValue !== null || memoryDrafts.has(storageKey);
      const clearedKey = `distrihub:draft-cleared:${scope}:${draftId.split(':')[0]}`;
      const wasCleared = memoryDrafts.has(clearedKey) || window.sessionStorage.getItem(clearedKey) === 'true';
      const legacyValue = !hasCurrentDraft && !wasCleared && legacyKey ? window.sessionStorage.getItem(legacyKey) ?? (memoryDrafts.has(legacyKey) ? JSON.stringify(memoryDrafts.get(legacyKey)) : null) : null;
      const value = currentValue ?? legacyValue;
      const parsed: unknown = value === null ? memoryDrafts.get(storageKey) ?? initialValue : JSON.parse(value);
      const valid = validate ? validate(parsed) : initialValue === null ? parsed === null || typeof parsed === 'object'
        : Array.isArray(initialValue) ? Array.isArray(parsed)
        : typeof parsed === typeof initialValue && (typeof initialValue !== 'object' || (parsed !== null && !Array.isArray(parsed)));
      if (!valid) throw new Error('Rascunho incompatível; o formulário foi recuperado com os valores iniciais.');
      return {storageKey, value: parsed as T, error: null, migratedKey: legacyValue !== null ? legacyKey : null};
    } catch (error) {
      return {
        storageKey,
        value: (memoryDrafts.get(storageKey) ?? initialValue) as T,
        error: error instanceof Error ? error.message : 'Erro ao ler o armazenamento temporário.',
        migratedKey: null,
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
      if (stored.migratedKey && stored.migratedKey !== storageKey) {
        window.sessionStorage.removeItem(stored.migratedKey);
        memoryDrafts.delete(stored.migratedKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gravar o armazenamento temporário.';
      if (context) context.reportError(message);
      else console.error('Não foi possível salvar o rascunho da sessão.', message);
    }
  }, [context, storageKey, value, stored.storageKey, stored.migratedKey]);

  return [value, setValue];
}
