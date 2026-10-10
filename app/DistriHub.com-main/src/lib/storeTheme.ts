export function normalizeColor(value: string | null | undefined, fallback = '#3193e5'): string {
  if (/^#[0-9a-f]{6}$/i.test(value ?? '')) return value!.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value ?? '')) return '#' + value!.slice(1).toLowerCase().split('').map(c => c + c).join('');
  return fallback;
}

function rgb(color: string): number[] {
  return [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
}

function luminance(color: string): number {
  const channels = rgb(normalizeColor(color)).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastText(color: string): string {
  const light = luminance(color);
  return (light + 0.05) / 0.05 > 1.05 / (light + 0.05) ? '#000000' : '#ffffff';
}

function darken(color: string, factor: number): string {
  return '#' + rgb(color).map(value => Math.round(value * factor).toString(16).padStart(2, '0')).join('');
}

export function storeTheme(primary?: string | null, navigation?: string | null): Record<string, string> {
  const color = normalizeColor(primary);
  const nav = normalizeColor(navigation, '#0f2747');
  let readable = color;
  while ((luminance(readable) + 0.05) / (luminance('#102638') + 0.05) < 4.5) {
    readable = '#' + rgb(readable).map(value => Math.min(255, Math.round(value + (255 - value) * 0.15)).toString(16).padStart(2, '0')).join('');
  }
  const hover = darken(color, 0.85);
  const channels = rgb(color).join(',');
  return {
    '--dh-blue': color,
    '--dh-blue-hover': hover,
    '--dh-blue-soft': `rgba(${channels},0.08)`,
    '--dh-blue-soft-strong': `rgba(${channels},0.14)`,
    '--dh-blue-border': `rgba(${channels},0.3)`,
    '--dh-accent-text': readable,
    '--dh-on-primary': contrastText(color),
    '--dh-on-primary-hover': contrastText(hover),
    '--store-nav': nav,
    '--store-nav-text': contrastText(nav),
  };
}
