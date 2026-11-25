// ============================================================
// VibeVault – Navigation param lists
// ============================================================

import type { NavigatorScreenParams } from '@react-navigation/native';

export type ItemDetailParams = { itemId: string };

export type DiscoverStackParamList = {
  DiscoverFeed: undefined;
  ItemDetail: ItemDetailParams;
};

export type ComposeStackParamList = {
  ComposeMain: undefined;
  ItemDetail: ItemDetailParams;
};

export type DealsStackParamList = {
  DealsFeed: { view?: 'deals' | 'alerts' | 'wishlist' } | undefined;
  ItemDetail: ItemDetailParams;
};

export type QuestsStackParamList = {
  QuestList: undefined;
  QuestDetail: { questId: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
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
