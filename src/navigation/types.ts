// ============================================================
// VibeVault – Navigation param lists
// ============================================================

import type { NavigatorScreenParams } from '@react-navigation/native';

/** `tab` opens a section other than the default (Price & timing). */
export type ItemDetailParams = { itemId: string; tab?: ItemDetailTab };
export type ItemDetailTab = 'price' | 'style' | 'details';

export type DiscoverStackParamList = {
  DiscoverFeed: undefined;
  ItemDetail: ItemDetailParams;
};

export type ComposeStackParamList = {
  ComposeMain: undefined;
  ItemDetail: ItemDetailParams;
};

/** The views of the Deals tab. Saved items live on the Wishlist screen (Profile). */
export type DealsView = 'deals' | 'coupons' | 'alerts';

export type DealsStackParamList = {
  DealsFeed: { view?: DealsView } | undefined;
  ItemDetail: ItemDetailParams;
};

export type QuestsStackParamList = {
  QuestList: undefined;
  QuestDetail: { questId: string };
};

export type ProfileStackParamList = {
  /** `pick: 'country'` opens the country picker (e.g. from Deals, to see coupons). */
  ProfileMain: { pick?: 'country' } | undefined;
  Wishlist: undefined;
  ItemDetail: ItemDetailParams;
};

/** Any stack that can show ItemDetail. */
export type ItemDetailStackParamList =
  | DiscoverStackParamList
  | ComposeStackParamList
  | DealsStackParamList
  | ProfileStackParamList;

export type RootTabParamList = {
  Discover: NavigatorScreenParams<DiscoverStackParamList> | undefined;
  Profiler: undefined;
  Compose: NavigatorScreenParams<ComposeStackParamList> | undefined;
  Prices: NavigatorScreenParams<DealsStackParamList> | undefined;
  Quests: NavigatorScreenParams<QuestsStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootTabParamList {}
  }
}
