// ============================================================
// VibeVault – Backend configuration
// Set in .env (see .env.example). EXPO_PUBLIC_ values are
// embedded in the app at build time; the anon/publishable key is
// designed to be public and only grants read access (RLS).
// ============================================================

export interface BackendConfig {
  url: string;
  anonKey: string;
}

function readConfig(): BackendConfig | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  // The example's placeholder URL counts as not configured.
  if (!url || !anonKey || !/^https?:\/\//.test(url) || url.includes('your-project-ref')) return null;
  return { url, anonKey };
}

export const backendConfig: BackendConfig | null = readConfig();
