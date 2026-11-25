// ============================================================
// VibeVault – Navigation (Bottom Tabs + per-tab native stacks)
// Each tab owns a stack so detail screens keep the tab bar.
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, FontSize } from '../constants/theme';
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
  Profiler: { active: 'sparkles', inactive: 'sparkles-outline' },
  Compose: { active: 'shirt', inactive: 'shirt-outline' },
  Prices: { active: 'pricetags', inactive: 'pricetags-outline' },
  Quests: { active: 'trophy', inactive: 'trophy-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

export default function AppNavigator() {
  const insets = useSafeAreaInsets();
  const unseenAlerts = useUnseenTriggeredAlertCount();
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      initialRouteName="Discover"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 60 + bottomPadding, paddingBottom: bottomPadding }],
        tabBarActiveTintColor: Colors.primaryLight,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color }) => (
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Ionicons name={focused ? TAB_ICONS[route.name].active : TAB_ICONS[route.name].inactive} size={20} color={color} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverStackNav} options={{ tabBarLabel: 'Discover' }} />
      <Tab.Screen name="Profiler" component={ProfilerScreen} options={{ tabBarLabel: 'My Vibe' }} />
      <Tab.Screen name="Compose" component={ComposeStackNav} options={{ tabBarLabel: 'Compose' }} />
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
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  iconContainer: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: Colors.primary + '30',
  },
  badge: {
    backgroundColor: Colors.accent,
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
