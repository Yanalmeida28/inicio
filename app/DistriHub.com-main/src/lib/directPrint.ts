const endpoint = 'http://localhost:17891';
const storageKey = 'distrihub:receipt-printer:v1';
export type PrinterPreferences = { name: string; width: '58' | '80' };
export function printerPreferences(): PrinterPreferences | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return value && typeof value.name === 'string' && value.name.trim() && ['58', '80'].includes(value.width) ? value : null;
  } catch { return null; }
}
export function savePrinter(value: PrinterPreferences | null) {
  if (value) localStorage.setItem(storageKey, JSON.stringify(value));
  else localStorage.removeItem(storageKey);
}
async function request(path: string, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), body ? 30000 : 5000);
  try {
    const response = await fetch(endpoint + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'O conector recusou a impressão.');
    return result;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Abra o Conector DistriHub no Windows e permita o acesso à rede local se o navegador solicitar.');
    if (error instanceof Error && error.name === 'AbortError') throw new Error(body ? 'A confirmação da impressão não chegou. Confira a impressora antes de reimprimir para evitar dois cupons.' : 'O conector não respondeu. Abra o Conector DistriHub no Windows.');
    throw error;
  } finally { clearTimeout(timer); }
}
export async function listReceiptPrinters(): Promise<string[]> {
  const result = await request('/printers');
  if (!Array.isArray(result.printers) || !result.printers.every((name: unknown) => typeof name === 'string')) throw new Error('Resposta inválida do conector.');
  return result.printers;
}
const pendingReceipts = new Map<string, Promise<void>>();
export function sendReceipt(text: string, preferences = printerPreferences()): Promise<void> {
  if (!preferences) return Promise.reject(new Error('Escolha uma impressora em Configurações.'));
  const key = JSON.stringify([preferences, text]);
  const existing = pendingReceipts.get(key);
  if (existing) return existing;
  const job = request('/print', { id: crypto.randomUUID(), printer: preferences.name, width: Number(preferences.width), text }).then(result => {
    if (result.status !== 'queued') throw new Error('A impressão não foi confirmada. Confira a impressora antes de reimprimir.');
  }).finally(() => pendingReceipts.delete(key));
  pendingReceipts.set(key, job);
  return job;
}
