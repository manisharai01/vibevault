// ============================================================
// VibeVault – Daily lifecycle tasks
//   • refresh the catalogue if the day changed (prices move daily)
//   • expire overdue quests
//   • record the daily visit (streaks)
//   • check price alerts and tell the user about any hits
// Run on launch, on foreground, at day rollover and on refresh.
// ============================================================

import { navigationRef } from '../navigation/navigationRef';
import { TriggeredAlert, useStore } from '../store/useStore';
import { Badge } from '../types';
import { confirmAction, notify } from '../utils/dialog';
import { formatPrice } from '../utils/format';

function describeHits(triggered: TriggeredAlert[]): string {
  return triggered
    .slice(0, 3)
    .map(({ alert, item }) => `• ${item.title}: now ${formatPrice(item.currentPrice)} (target ${formatPrice(alert.targetPrice)})`)
    .concat(triggered.length > 3 ? [`…and ${triggered.length - 3} more`] : [])
    .join('\n');
}

function describeBadges(badges: Badge[]): string {
  return badges.map((b) => `🏅 ${b.icon} ${b.name} — ${b.description}`).join('\n');
}

export function runLifecycleTasks(now: Date = new Date()) {
  const store = useStore.getState();
  store.refreshCatalog(now);
  store.expireQuests(now);
  const visit = store.recordDailyVisit(now);
  const alerts = store.checkPriceAlerts(now);
  return { triggered: alerts.triggered, newBadges: [...visit.newBadges, ...alerts.newBadges] };
}

function openAlerts() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Prices', { screen: 'DealsFeed', params: { view: 'alerts' }, pop: true });
  }
}

/** Runs the daily tasks and tells the user about price drops and new badges. */
export function refreshAndNotify(now: Date = new Date()): void {
  const { triggered, newBadges } = runLifecycleTasks(now);
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
