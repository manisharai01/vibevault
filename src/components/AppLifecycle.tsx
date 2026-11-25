// ============================================================
// VibeVault – App lifecycle
// Runs the daily tasks (services/lifecycle.ts) on launch, when the
// app returns to the foreground and when a new day starts while it
// is open. Mount inside NavigationContainer once it is ready
// (see App.tsx), because the tasks may navigate.
// ============================================================

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { refreshAndNotify } from '../services/lifecycle';
import { useStore } from '../store/useStore';
import { toDateKey } from '../utils/date';
import { notify } from '../utils/dialog';

const DAY_CHECK_INTERVAL_MS = 60_000;
let storageNoticeShown = false;

export default function AppLifecycle() {
  useEffect(() => {
    if (!useStore.getState().storageAvailable && !storageNoticeShown) {
      storageNoticeShown = true;
      notify(
        'Couldn’t load your saved data',
        'VibeVault will keep working, but changes you make now won’t be saved. Restart the app to try again.',
      );
    }

    refreshAndNotify();

    let lastState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (lastState !== 'active' && next === 'active') refreshAndNotify();
      lastState = next;
    });

    // Roll over to the new day if the app stays open past midnight.
    const dayCheck = setInterval(() => {
      const now = new Date();
      if (toDateKey(now) !== useStore.getState().catalogDate) refreshAndNotify(now);
    }, DAY_CHECK_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(dayCheck);
    };
  }, []);

  return null;
}
