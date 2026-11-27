// ============================================================
// VibeVault – Using a coupon / offer
// One tap copies the code (so it can be pasted at checkout) and
// opens the store.
// ============================================================

import { Offer } from '../types';
import { copyText } from '../utils/clipboard';
import { openUrl } from './linking';

export interface RedeemResult {
  /** The code is on the clipboard (false when the offer has no code). */
  copied: boolean;
  /** The store's page was opened. */
  opened: boolean;
}

export async function redeemOffer(offer: Pick<Offer, 'code' | 'url'>): Promise<RedeemResult> {
  // Copy before opening the store, so the code is on the clipboard by the time the store's page appears.
  const copied = offer.code ? await copyText(offer.code) : false;
  const opened = await openUrl(offer.url);
  return { copied, opened };
}
