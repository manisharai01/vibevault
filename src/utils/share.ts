// ============================================================
// VibeVault – Share helper (native share sheet, Web Share API,
// or clipboard as a last resort on web)
// ============================================================

import { Platform, Share } from 'react-native';

export type ShareResult = 'shared' | 'copied' | 'dismissed' | 'unavailable';

interface WebNavigator {
  share?: (data: { title?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export async function shareText(title: string, message: string): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const nav = (globalThis as { navigator?: WebNavigator }).navigator;
    try {
      if (nav?.share) {
        await nav.share({ title, text: message });
        return 'shared';
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'dismissed';
    }
    try {
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(message);
        return 'copied';
      }
    } catch {
      // fall through
    }
    return 'unavailable';
  }

  try {
    const result = await Share.share({ title, message });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    return 'unavailable';
  }
}
