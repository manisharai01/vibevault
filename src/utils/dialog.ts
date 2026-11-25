// ============================================================
// VibeVault – Cross-platform dialogs
// react-native-web's Alert.alert is a no-op, so on web we fall
// back to the browser's alert/confirm dialogs.
// ============================================================

import { Alert, Platform } from 'react-native';

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function confirmAction({ title, message, confirmText, destructive, onConfirm }: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
