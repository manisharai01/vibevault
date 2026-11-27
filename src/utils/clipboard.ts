// ============================================================
// VibeVault – Clipboard (expo-clipboard on every platform)
// ============================================================

import * as Clipboard from 'expo-clipboard';

/** Copies text. Resolves false when the platform refuses (e.g. no clipboard permission in a browser). */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
