// Helpers that turn raw marketplace fields into clean values.

/** Android blocks plain-HTTP images, so upgrade marketplace URLs to HTTPS. */
export function toHttps(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return null;
}

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function toAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const COLOR_WORDS: [RegExp, string][] = [
  [/\bblack\b/i, '#1C1C1C'],
  [/\bwhite\b|\boff[- ]white\b/i, '#F5F5F5'],
  [/\bcream\b|\bivory\b/i, '#F3EAD3'],
  [/\bbeige\b|\bkhaki\b|\bsand\b/i, '#D8C3A0'],
  [/\bbrown\b|\bchocolate\b|\bcoffee\b/i, '#6B4226'],
  [/\btan\b|\bcamel\b/i, '#C19A6B'],
  [/\bgr[ae]y\b|\bcharcoal\b/i, '#7D7D7D'],
  [/\bnavy\b/i, '#1F2A44'],
  [/\bblue\b|\bdenim\b|\bindigo\b/i, '#3A6EA5'],
  [/\bsky\b|\bpowder blue\b|\blight blue\b/i, '#A7C7E7'],
  [/\bgreen\b|\bolive\b|\bsage\b|\bkhaki green\b/i, '#556B2F'],
  [/\bred\b|\bscarlet\b/i, '#C62828'],
  [/\bmaroon\b|\bburgundy\b|\bwine\b/i, '#6D1A36'],
  [/\bpink\b|\bblush\b|\brose\b/i, '#E8A0B4'],
  [/\bpurple\b|\blavender\b|\blilac\b|\bviolet\b/i, '#8E6BBF'],
  [/\byellow\b|\bmustard\b/i, '#E0B526'],
  [/\borange\b|\brust\b/i, '#D9692B'],
  [/\bgold(en)?\b/i, '#D4AF37'],
  [/\bsilver\b/i, '#C0C0C0'],
];

/** Colour swatches mentioned in free text (title, colour attribute), at most three. */
export function colorsFromText(...texts: unknown[]): string[] {
  const haystack = texts.filter((t): t is string => typeof t === 'string').join(' ');
  const found: string[] = [];
  for (const [pattern, hex] of COLOR_WORDS) {
    if (pattern.test(haystack) && !found.includes(hex)) found.push(hex);
    if (found.length === 3) break;
  }
  return found;
}
