// ============================================================
// VibeVault – Country reference data (ISO 3166-1 names and the
// ISO 4217 currency used there). Which countries have live
// listings comes from the backend (available_markets).
// ============================================================

export interface Country {
  code: string;
  name: string;
  currency: string;
}

export const COUNTRIES: Country[] = [
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'AR', name: 'Argentina', currency: 'ARS' },
  { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT' },
  { code: 'BE', name: 'Belgium', currency: 'EUR' },
  { code: 'BR', name: 'Brazil', currency: 'BRL' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF' },
  { code: 'CL', name: 'Chile', currency: 'CLP' },
  { code: 'CN', name: 'China', currency: 'CNY' },
  { code: 'CO', name: 'Colombia', currency: 'COP' },
  { code: 'CZ', name: 'Czechia', currency: 'CZK' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'DK', name: 'Denmark', currency: 'DKK' },
  { code: 'EG', name: 'Egypt', currency: 'EGP' },
  { code: 'ES', name: 'Spain', currency: 'EUR' },
  { code: 'FI', name: 'Finland', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'GR', name: 'Greece', currency: 'EUR' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD' },
  { code: 'HU', name: 'Hungary', currency: 'HUF' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'IL', name: 'Israel', currency: 'ILS' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'KR', name: 'South Korea', currency: 'KRW' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR' },
  { code: 'MX', name: 'Mexico', currency: 'MXN' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'NO', name: 'Norway', currency: 'NOK' },
  { code: 'NP', name: 'Nepal', currency: 'NPR' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { code: 'PE', name: 'Peru', currency: 'PEN' },
  { code: 'PH', name: 'Philippines', currency: 'PHP' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR' },
  { code: 'PL', name: 'Poland', currency: 'PLN' },
  { code: 'PT', name: 'Portugal', currency: 'EUR' },
  { code: 'QA', name: 'Qatar', currency: 'QAR' },
  { code: 'RO', name: 'Romania', currency: 'RON' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' },
  { code: 'SE', name: 'Sweden', currency: 'SEK' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'TH', name: 'Thailand', currency: 'THB' },
  { code: 'TR', name: 'Türkiye', currency: 'TRY' },
  { code: 'TW', name: 'Taiwan', currency: 'TWD' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'VN', name: 'Vietnam', currency: 'VND' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string | null | undefined): Country | null {
  return code ? (BY_CODE.get(code.toUpperCase()) ?? null) : null;
}

export function countryName(code: string | null | undefined): string {
  return countryByCode(code)?.name ?? (code ? code.toUpperCase() : 'Unknown');
}

/** 🇮🇳 from "IN" (regional indicator symbols). */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(...code.toUpperCase().split('').map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
}

/**
 * Best guess of the user's country from the device locale (e.g. "en-IN" → "IN"),
 * used only as the default answer to the profiler's country question.
 */
export function guessCountryFromLocale(locale: string | undefined = undefined): string | null {
  let tag = locale;
  if (!tag) {
    try {
      tag = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      tag = undefined;
    }
  }
  const match = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(tag ?? '');
  const code = match?.[1]?.toUpperCase();
  return code && BY_CODE.has(code) ? code : null;
}
