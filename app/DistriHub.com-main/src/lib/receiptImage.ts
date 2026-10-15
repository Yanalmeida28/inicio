import html2canvas from 'html2canvas';

export type ReceiptImage = { png: string; pixelWidth: number; pixelHeight: number };

/** Render the same receipt document offscreen; never open a window or print. */
export async function renderReceiptImage(render: (target: Window) => void, width: '58' | '80'): Promise<ReceiptImage> {
  const frame = document.createElement('iframe');
  frame.title = 'Preparando cupom para impressão direta';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}mm;height:1px;border:0;pointer-events:none`;
  document.body.append(frame);
  try {
    const target = frame.contentWindow;
    if (!target) throw new Error('Não foi possível preparar a imagem do cupom.');
    render(target);
    const doc = target.document;
    Object.assign(doc.body.style, { width: `${width}mm`, padding: '4mm', display: 'flow-root', boxSizing: 'border-box', margin: '0' });
    for (const image of Array.from(doc.images)) {
      // Inline remote logos first. Never silently print a receipt without its logo.
      if (!image.src.startsWith('data:')) {
        const response = await fetch(image.src, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Não foi possível carregar o logo do cupom.');
        const blob = await response.blob();
        image.src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Não foi possível preparar o logo do cupom.'));
          reader.readAsDataURL(blob);
        });
      }
      await image.decode();
    }
    await doc.fonts.ready;
    const height = Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height));
    const pixelWidth = Math.ceil(Number(width) / 25.4 * 203);
    const scale = pixelWidth / doc.body.getBoundingClientRect().width;
    if (height * scale > 30000) throw new Error('Cupom muito longo para impressão direta. Use a impressão pelo navegador.');
    const output = document.createElement('canvas');
    output.width = pixelWidth;
    output.height = Math.ceil(height * scale);
    const canvas = await html2canvas(doc.body, { canvas: output, backgroundColor: '#ffffff', scale, width: doc.body.getBoundingClientRect().width, height, useCORS: true, logging: false, imageTimeout: 15000 });
    const png = canvas.toDataURL('image/png').split(',')[1];
    if (!png || png.length > 8000000) throw new Error('Imagem do cupom muito grande. Use a impressão pelo navegador.');
    return { png, pixelWidth: canvas.width, pixelHeight: canvas.height };
  } finally {
    frame.remove();
  }
}
