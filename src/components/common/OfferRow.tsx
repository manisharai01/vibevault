// ============================================================
// VibeVault – One coupon / offer
// Tapping it copies the code (if there is one) and opens the store,
// so the code is ready to paste at checkout. The list remembers
// which code was copied last (`copied`), so it still says so when
// the shopper comes back from the store.
// ============================================================

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, Fonts, FontSize, Spacing } from '../../constants/theme';
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
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  info: { flex: 1 },
  merchant: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.offer, textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { fontFamily: Fonts.medium, fontSize: FontSize.md, color: Colors.ink, marginTop: 3, lineHeight: 20 },
  meta: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  codeBox: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.offer,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.offerTint,
  },
  codeBoxCopied: { borderStyle: 'solid', borderColor: Colors.buy, backgroundColor: Colors.buyTint },
  codeText: { fontFamily: Fonts.bold, color: Colors.ink, fontSize: FontSize.sm, letterSpacing: 1 },
  codeHint: { fontFamily: Fonts.medium, color: Colors.textSecondary, fontSize: 10, marginTop: 2 },
  dealOnly: { fontFamily: Fonts.semibold, color: Colors.ink, fontSize: FontSize.sm, textDecorationLine: 'underline' },
});
