// ============================================================
// VibeVault – App lifecycle
// Loads the cached catalogue, then syncs live prices and runs the
// daily tasks (services/lifecycle.ts) on launch, when the app
// returns to the foreground, and periodically while it stays open.
// Mount inside NavigationContainer once it is ready (see App.tsx),
// because the tasks may navigate.
// ============================================================

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { refreshAndNotify } from '../services/lifecycle';
import { CATALOG_SYNC_INTERVAL_MS, useStore } from '../store/useStore';
import { toDateKey } from '../utils/date';
import { notify } from '../utils/dialog';

const CHECK_INTERVAL_MS = 60_000;
let storageNoticeShown = false;

export default function AppLifecycle() {
  useEffect(() => {
    let cancelled = false;
    let lastRunDay = toDateKey(new Date());

    if (!useStore.getState().storageAvailable && !storageNoticeShown) {
      storageNoticeShown = true;
      notify(
        'Couldn’t load your saved data',
        'VibeVault will keep working, but changes you make now won’t be saved. Restart the app to try again.',
      );
    }

    const run = (force = false) => {
      lastRunDay = toDateKey(new Date());
      refreshAndNotify({ force }).catch((error) => console.warn('[VibeVault] refresh failed', error));
    };

    (async () => {
      await useStore.getState().loadCachedCatalog();
      if (!cancelled) run();
    })();

    let lastState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (lastState !== 'active' && next === 'active') run();
      lastState = next;
    });

    // While the app stays open: new day (streaks/quests) or stale prices → run again.
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const { catalogFetchedAt } = useStore.getState();
      const stale = !catalogFetchedAt || Date.now() - new Date(catalogFetchedAt).getTime() > CATALOG_SYNC_INTERVAL_MS;
      if (stale || toDateKey(new Date()) !== lastRunDay) run();
    }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  return null;
}
