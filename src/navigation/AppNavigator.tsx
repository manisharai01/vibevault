// ============================================================
// VibeVault – Navigation (Bottom Tabs + per-tab native stacks)
// Each tab owns a stack so detail screens keep the tab bar.
// ============================================================

import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Fonts } from '../constants/theme';
import { useUnseenTriggeredAlertCount } from '../store/hooks';
import {
  ComposeStackParamList,
  DealsStackParamList,
  DiscoverStackParamList,
  ItemDetailParams,
  ProfileStackParamList,
  QuestsStackParamList,
  RootTabParamList,
} from './types';

import ComposerScreen from '../screens/ComposerScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import PriceScreen from '../screens/PriceScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProfilerScreen from '../screens/ProfilerScreen';
import QuestDetailScreen from '../screens/QuestDetailScreen';
import QuestsScreen from '../screens/QuestsScreen';
import WishlistScreen from '../screens/WishlistScreen';

const DiscoverStack = createNativeStackNavigator<DiscoverStackParamList>();
const ComposeStack = createNativeStackNavigator<ComposeStackParamList>();
const DealsStack = createNativeStackNavigator<DealsStackParamList>();
const QuestsStack = createNativeStackNavigator<QuestsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'slide_from_right',
  contentStyle: { backgroundColor: Colors.background },
};

/** One ItemDetail route per item, so opening another item never reuses an open page. */
const itemDetailId = ({ params }: { params?: ItemDetailParams }) => params?.itemId;

function DiscoverStackNav() {
  return (
    <DiscoverStack.Navigator screenOptions={stackScreenOptions}>
      <DiscoverStack.Screen name="DiscoverFeed" component={DiscoverScreen} />
      <DiscoverStack.Screen name="ItemDetail" component={ItemDetailScreen} getId={itemDetailId} />
    </DiscoverStack.Navigator>
  );
}

function ComposeStackNav() {
  return (
    <ComposeStack.Navigator screenOptions={stackScreenOptions}>
      <ComposeStack.Screen name="ComposeMain" component={ComposerScreen} />
      <ComposeStack.Screen name="ItemDetail" component={ItemDetailScreen} getId={itemDetailId} />
    </ComposeStack.Navigator>
  );
}

function DealsStackNav() {
  return (
    <DealsStack.Navigator screenOptions={stackScreenOptions}>
      <DealsStack.Screen name="DealsFeed" component={PriceScreen} />
      <DealsStack.Screen name="ItemDetail" component={ItemDetailScreen} getId={itemDetailId} />
    </DealsStack.Navigator>
  );
}

function QuestsStackNav() {
  return (
    <QuestsStack.Navigator screenOptions={stackScreenOptions}>
      <QuestsStack.Screen name="QuestList" component={QuestsScreen} />
      <QuestsStack.Screen name="QuestDetail" component={QuestDetailScreen} />
    </QuestsStack.Navigator>
  );
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="Wishlist" component={WishlistScreen} />
      <ProfileStack.Screen name="ItemDetail" component={ItemDetailScreen} getId={itemDetailId} />
    </ProfileStack.Navigator>
  );
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof RootTabParamList, { active: IoniconName; inactive: IoniconName }> = {
  Discover: { active: 'compass', inactive: 'compass-outline' },
  Profiler: { active: 'finger-print', inactive: 'finger-print-outline' },
  Compose: { active: 'grid', inactive: 'grid-outline' },
  Prices: { active: 'pricetag', inactive: 'pricetag-outline' },
  Quests: { active: 'flag', inactive: 'flag-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export default function AppNavigator() {
  const insets = useSafeAreaInsets();
  const unseenAlerts = useUnseenTriggeredAlertCount();
  const bottomPadding = Math.max(insets.bottom, 8);
  // Six tabs on a 320–359 pt wide phone: smaller labels and no side padding so "Discover" fits.
  const compact = useWindowDimensions().width < 360;

  return (
    <Tab.Navigator
      initialRouteName="Discover"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 60 + bottomPadding, paddingBottom: bottomPadding }],
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: compact ? [styles.tabLabel, styles.tabLabelCompact] : styles.tabLabel,
        tabBarItemStyle: compact ? styles.tabItemCompact : undefined,
        tabBarIcon: ({ focused, color }) => (
          <View style={styles.iconContainer}>
            <Ionicons name={focused ? TAB_ICONS[route.name].active : TAB_ICONS[route.name].inactive} size={21} color={color} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverStackNav} options={{ tabBarLabel: 'Discover' }} />
      <Tab.Screen name="Profiler" component={ProfilerScreen} options={{ tabBarLabel: 'Style' }} />
      <Tab.Screen name="Compose" component={ComposeStackNav} options={{ tabBarLabel: 'Stylist' }} />
      <Tab.Screen
        name="Prices"
        component={DealsStackNav}
        options={{
          tabBarLabel: 'Deals',
          tabBarBadge: unseenAlerts > 0 ? unseenAlerts : undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tab.Screen name="Quests" component={QuestsStackNav} options={{ tabBarLabel: 'Quests' }} />
      <Tab.Screen name="Profile" component={ProfileStackNav} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
  },
  tabLabelCompact: {
    fontSize: 10,
    letterSpacing: -0.1,
  },
  tabItemCompact: {
    paddingHorizontal: 0,
  },
  iconContainer: {
    width: 36,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: Colors.offer,
    color: Colors.textInverse,
    fontFamily: Fonts.semibold,
    fontSize: 10,
  },
});
