import { withLoadTimeout } from './partnerSync';

export function moduleLoader<T>(loader: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = withLoadTimeout(loader, 'Não foi possível baixar os arquivos deste módulo.').catch(error => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}
