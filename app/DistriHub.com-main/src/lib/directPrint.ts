const endpoint = 'http://localhost:17891';
const storageKey = 'distrihub:receipt-printer:v1';
export type PrinterPreferences = { name: string; width: '58' | '80'; mode?: 'personalized' | 'text' | 'image' };
export function isMacComputer(): boolean {
  return typeof navigator !== 'undefined' && /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent + ' ' + navigator.platform);
}
export function printerPreferences(): PrinterPreferences | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!value || typeof value.name !== 'string' || !value.name.trim() || !['58', '80'].includes(value.width)) return null;
    // The bundled connector is Windows-only. Restored preferences must not
    // route Mac receipts to a service that cannot be installed on this device.
    return isMacComputer() ? { ...value, mode: 'personalized' } : value;
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
    if (error instanceof TypeError) throw new Error(body ? 'A confirmação da impressão não chegou. Confira a impressora antes de reimprimir para evitar dois cupons. Verifique também se o Conector DistriHub está aberto e se o navegador permite acesso à rede local.' : 'Abra o Conector DistriHub no Windows e permita o acesso à rede local se o navegador solicitar.');
    if (error instanceof Error && error.name === 'AbortError') throw new Error(body ? 'A confirmação da impressão não chegou. Confira a impressora antes de reimprimir para evitar dois cupons.' : 'O conector não respondeu. Abra o Conector DistriHub no Windows.');
    throw error;
  } finally { clearTimeout(timer); }
}
export async function listReceiptPrinters(): Promise<string[]> {
  const result = await request('/printers');
  if (!Array.isArray(result.printers) || !result.printers.every((name: unknown) => typeof name === 'string')) throw new Error('Resposta inválida do conector.');
  return result.printers;
}
export async function requireImageConnector(): Promise<void> {
  const result = await request('/printers');
  if (typeof result.version !== 'number' || result.version < 2 || !Array.isArray(result.capabilities) || !result.capabilities.includes('receipt-png-v1')) {
    throw new Error('Atualize o Conector DistriHub neste computador para imprimir a personalização sem abrir a janela do navegador.');
  }
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

export function sendReceiptImage(image: { png: string; pixelWidth: number; pixelHeight: number }, preferences = printerPreferences()): Promise<void> {
  if (!preferences) return Promise.reject(new Error('Escolha uma impressora em Configurações.'));
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.png) || image.png.length > 8000000 || !Number.isInteger(image.pixelWidth) || !Number.isInteger(image.pixelHeight) || image.pixelWidth < 1 || image.pixelWidth > 1024 || image.pixelHeight < 1 || image.pixelHeight > 30000) {
    return Promise.reject(new Error('Imagem do cupom inválida.'));
  }
  const key = JSON.stringify(['image', preferences, image]);
  const existing = pendingReceipts.get(key);
  if (existing) return existing;
  const job = requireImageConnector().then(() => request('/print', {
    id: crypto.randomUUID(), printer: preferences.name, width: Number(preferences.width),
    format: 'receipt-png-v1', ...image,
  })).then(result => {
    if (result.status !== 'queued') throw new Error('A impressão não foi confirmada. Confira a impressora antes de reimprimir.');
  }).finally(() => pendingReceipts.delete(key));
  pendingReceipts.set(key, job);
  return job;
}
