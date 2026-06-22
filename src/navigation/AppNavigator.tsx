// ============================================================
// VibeVault – Navigation (Stack + Bottom Tabs)
// Each tab wraps a StackNavigator so ItemDetail can be pushed
// without losing the tab bar context.
// ============================================================

import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors, FontSize } from '../constants/theme';

import DiscoverScreen from '../screens/DiscoverScreen';
import ProfilerScreen from '../screens/ProfilerScreen';
import PriceScreen from '../screens/PriceScreen';
import QuestsScreen from '../screens/QuestsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import WishlistScreen from '../screens/WishlistScreen';
import ComposerScreen from '../screens/ComposerScreen';

const DiscoverStack = createNativeStackNavigator();
const PriceStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const ComposeStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
};

function DiscoverStackNav() {
  return (
    <DiscoverStack.Navigator screenOptions={stackScreenOptions}>
      <DiscoverStack.Screen name="DiscoverFeed" component={DiscoverScreen} />
      <DiscoverStack.Screen name="ItemDetail" component={ItemDetailScreen as any} />
    </DiscoverStack.Navigator>
  );
}

function PriceStackNav() {
  return (
    <PriceStack.Navigator screenOptions={stackScreenOptions}>
      <PriceStack.Screen name="PriceFeed" component={PriceScreen} />
      <PriceStack.Screen name="ItemDetail" component={ItemDetailScreen as any} />
    </PriceStack.Navigator>
  );
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="Wishlist" component={WishlistScreen} />
    </ProfileStack.Navigator>
  );
}

function ComposeStackNav() {
  return (
    <ComposeStack.Navigator screenOptions={stackScreenOptions}>
      <ComposeStack.Screen name="ComposeMain" component={ComposerScreen} />
      <ComposeStack.Screen name="ItemDetail" component={ItemDetailScreen as any} />
    </ComposeStack.Navigator>
  );
}

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, string> = {
  Discover: '◍',
  Profiler: '◈',
  Compose: '▦',
  Prices: '◔',
  Quests: '◉',
  Profile: '◎',
};

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={[styles.icon, focused && styles.iconActive]}>{TAB_ICONS[route.name]}</Text>
          </View>
        ),
      })}
      initialRouteName="Discover"
    >
      <Tab.Screen name="Discover" component={DiscoverStackNav} options={{ tabBarLabel: 'Discover' }} />
      <Tab.Screen name="Profiler" component={ProfilerScreen} options={{ tabBarLabel: 'My Vibe' }} />
      <Tab.Screen name="Compose" component={ComposeStackNav} options={{ tabBarLabel: 'Compose' }} />
      <Tab.Screen name="Prices" component={PriceStackNav} options={{ tabBarLabel: 'Deals' }} />
      <Tab.Screen name="Quests" component={QuestsScreen} options={{ tabBarLabel: 'Quests' }} />
      <Tab.Screen name="Profile" component={ProfileStackNav} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 75,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: Colors.primary + '25',
  },
  icon: { fontSize: 18, color: Colors.textMuted, fontWeight: '700' },
  iconActive: { color: Colors.primaryLight },
});
