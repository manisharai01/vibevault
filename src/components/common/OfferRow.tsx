// ============================================================
// VibeVault – One coupon / offer
// Tapping it copies the code (if there is one) and opens the store,
// so the code is ready to paste at checkout. The list remembers
// which code was copied last (`copied`), so it still says so when
// the shopper comes back from the store.
// ============================================================

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../../constants/theme';
import { redeemOffer } from '../../services/redeem';
import { Offer } from '../../types';
import { notify } from '../../utils/dialog';
import { formatMoney, formatTimeLeft } from '../../utils/format';

interface OfferRowProps {
  offer: Offer;
  /** This offer's code is the one most recently copied. */
  copied: boolean;
  onCopied: (offerId: string) => void;
  /** A divider-separated row inside a card instead of a card of its own. */
  compact?: boolean;
}

export default function OfferRow({ offer, copied, onCopied, compact }: OfferRowProps) {
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const meta = [
    offer.discountText,
    offer.minSpend ? `min. spend ${offer.currency ? formatMoney(offer.minSpend, offer.currency) : offer.minSpend}` : null,
    offer.endsAt ? formatTimeLeft(offer.endsAt) : 'no end date given',
  ]
    .filter(Boolean)
    .join(' · ');

  const onPress = async () => {
    const result = await redeemOffer(offer);
    if (!mounted.current) return;
    if (result.copied) onCopied(offer.id);
    if (!result.opened) {
      notify(
        'Unable to open link',
        result.copied
          ? `The code ${offer.code} is copied — paste it at checkout on ${offer.merchant}.`
          : `Could not open ${offer.merchant} on your device.`,
      );
    }
  };

  return (
    <TouchableOpacity
      style={compact ? styles.row : styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="link"
      accessibilityLabel={`${offer.merchant}: ${offer.title}${offer.code ? `, code ${offer.code}` : ''}`}
      accessibilityHint={offer.code ? 'Copies the code and opens the store' : 'Opens the store'}
    >
      <View style={styles.info}>
        <Text style={styles.merchant} numberOfLines={1}>
          {offer.merchant}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {offer.title}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      {offer.code ? (
        <View style={[styles.codeBox, copied && styles.codeBoxCopied]}>
          <Text style={styles.codeText}>{offer.code}</Text>
          <Text style={styles.codeHint}>{copied ? 'Copied ✓' : 'Tap to copy'}</Text>
        </View>
      ) : (
        <Text style={styles.dealOnly}>Deal ›</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  info: { flex: 1 },
  merchant: { fontSize: FontSize.xs, color: Colors.primaryLight, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  codeBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.success,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  codeBoxCopied: { backgroundColor: Colors.success + '22' },
  codeText: { color: Colors.success, fontWeight: '800', fontSize: FontSize.sm, letterSpacing: 0.5 },
  codeHint: { color: Colors.textMuted, fontSize: 9, fontWeight: '600', marginTop: 1 },
  dealOnly: { color: Colors.primaryLight, fontWeight: '700', fontSize: FontSize.sm },
});
