// ============================================================
// VibeVault – Lifecycle tasks
//   • download live prices from the backend (if stale or forced)
//   • expire overdue quests
//   • record the daily visit (streaks)
//   • check price alerts against the fresh prices and tell the user
// Run on launch, on foreground, at day rollover and on pull-to-refresh.
// ============================================================

import { navigationRef } from '../navigation/navigationRef';
import { TriggeredAlert, useStore } from '../store/useStore';
import { Badge } from '../types';
import { confirmAction, notify } from '../utils/dialog';
import { formatMoney } from '../utils/format';

function describeHits(triggered: TriggeredAlert[]): string {
  return triggered
    .slice(0, 3)
    .map(
      ({ alert, item }) =>
        `• ${item.title}: now ${formatMoney(item.currentPrice, item.currency)} (target ${formatMoney(alert.targetPrice, alert.currency)})`,
    )
    .concat(triggered.length > 3 ? [`…and ${triggered.length - 3} more`] : [])
    .join('\n');
}

function describeBadges(badges: Badge[]): string {
  return badges.map((b) => `🏅 ${b.icon} ${b.name} — ${b.description}`).join('\n');
}

export async function runLifecycleTasks(options: { force?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const store = useStore.getState();
  await store.syncCatalog({ force: options.force, now });
  const latest = useStore.getState();
  latest.expireQuests(now);
  const visit = latest.recordDailyVisit(now);
  const alerts = latest.checkPriceAlerts(now);
  return { triggered: alerts.triggered, newBadges: [...visit.newBadges, ...alerts.newBadges] };
}

function openAlerts() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Prices', { screen: 'DealsFeed', params: { view: 'alerts' }, pop: true });
  }
}

/** Runs the lifecycle tasks and tells the user about price drops and new badges. */
export async function refreshAndNotify(options: { force?: boolean; now?: Date } = {}): Promise<void> {
  const { triggered, newBadges } = await runLifecycleTasks(options);
  if (triggered.length > 0) {
    const message = [describeHits(triggered), newBadges.length ? `\n${describeBadges(newBadges)}` : '']
      .filter(Boolean)
      .join('\n');
    confirmAction({
      title: triggered.length === 1 ? '🎯 Price drop alert!' : `🎯 ${triggered.length} price drop alerts!`,
      message,
      confirmText: 'View',
      onConfirm: openAlerts,
    });
  } else if (newBadges.length > 0) {
    notify('🏅 Badge unlocked!', describeBadges(newBadges));
  }
}
