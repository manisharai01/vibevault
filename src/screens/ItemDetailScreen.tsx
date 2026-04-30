// ============================================================
// VibeVault – Item Detail Screen
// Full product view with price analysis, AI match breakdown,
// sustainability data, styling tips, and wishlist management.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  Shadows,
  STYLE_COLORS,
  PLATFORM_COLORS,
} from '../constants/theme';
import { useStore } from '../store/useStore';
import { FashionItem, PriceAlert } from '../types';
import GradientCard from '../components/common/GradientCard';
import PriceChart from '../components/common/PriceChart';
import ProgressBar from '../components/common/ProgressBar';
import Tag from '../components/common/Tag';
import {
  generateForecast,
  getOptimalPurchaseWindow,
  getDealScore,
  getPredictionConfidence,
} from '../services/priceEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  route: { params: { item: FashionItem } };
  navigation: any;
}

const CONDITION_SCORE: Record<string, number> = {
  'New with tags': 100,
  'Like new': 85,
  'Good': 65,
  'Fair': 45,
  'Well-loved': 25,
};

export default function ItemDetailScreen({ route, navigation }: Props) {
  const { item } = route.params;
  const { profile, toggleWishlist, addPriceAlert, priceAlerts } = useStore();
  const insets = useSafeAreaInsets();

  const [alertPrice, setAlertPrice] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'price' | 'style'>('overview');

  const isWishlisted = profile.wishlist.includes(item.id);
  const hasAlert = priceAlerts.some((a) => a.itemId === item.id && a.active);
  const dealScore = getDealScore(item);
  const forecast = generateForecast(item, 30);
  const optimal = getOptimalPurchaseWindow(item);
  const conf7d = getPredictionConfidence(item, 7);
  const conf30d = getPredictionConfidence(item, 30);
  const savingsPercent = Math.round((1 - item.currentPrice / item.originalPrice) * 100);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 180], outputRange: [0, 1], extrapolate: 'clamp' });
  const imageScale = scrollY.interpolate({ inputRange: [-100, 0], outputRange: [1.3, 1], extrapolate: 'clamp' });

  const heartAnim = useRef(new Animated.Value(1)).current;

  const handleWishlistToggle = () => {
    Animated.sequence([
      Animated.timing(heartAnim, { toValue: 1.4, duration: 120, useNativeDriver: true }),
      Animated.timing(heartAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    toggleWishlist(item.id);
  };

  const handleSetAlert = () => {
    const target = parseFloat(alertPrice) || item.predictedPrice7d;
    if (target >= item.currentPrice) {
      Alert.alert('Invalid Price', 'Alert price must be lower than the current price.');
      return;
    }
    const alert: PriceAlert = {
      id: `alert-${Date.now()}`,
      itemId: item.id,
      targetPrice: target,
      currentPrice: item.currentPrice,
      active: true,
      createdAt: new Date().toISOString(),
    };
    addPriceAlert(alert);
    setAlertPrice('');
    Alert.alert('✅ Price Alert Set!', `We'll notify you when "${item.title}" drops below $${target.toFixed(2)}`);
  };

  const TABS = [
    { key: 'overview', label: '📋 Overview' },
    { key: 'price', label: '📈 Price' },
    { key: 'style', label: '🎨 Style Fit' },
  ];

  return (
    <View style={styles.container}>
      {/* Floating transparent header */}
      <Animated.View style={[styles.floatingHeader, { opacity: headerOpacity, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.floatingBack}>
          <Text style={styles.floatingBackText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.floatingTitle} numberOfLines={1}>{item.title}</Text>
        <Animated.View style={{ transform: [{ scale: heartAnim }] }}>
          <TouchableOpacity onPress={handleWishlistToggle} style={styles.floatingHeart}>
            <Text style={styles.heartIcon}>{isWishlisted ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Hero Image */}
        <View style={styles.imageContainer}>
          <Animated.Image
            source={{ uri: item.image }}
            style={[styles.heroImage, { transform: [{ scale: imageScale }] }]}
            resizeMode="cover"
          />
          <LinearGradient colors={['transparent', Colors.background]} style={styles.imageOverlay} />

          {/* Match Badge */}
          <View style={styles.matchBadge}>
            <LinearGradient
              colors={item.matchScore >= 80 ? Colors.gradientEco as [string,string] : Colors.gradientPrimary as [string,string]}
              style={styles.matchBadgeGrad}
            >
              <Text style={styles.matchPct}>{item.matchScore}%</Text>
              <Text style={styles.matchLbl}>Match</Text>
            </LinearGradient>
          </View>

          {/* Platform badge */}
          <View style={[styles.platformBadge, { backgroundColor: PLATFORM_COLORS[item.platform] || Colors.primary }]}>
            <Text style={styles.platformText}>{item.platform}</Text>
          </View>

          {/* Back button */}
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 10 }]}
            onPress={() => navigation.goBack()}
          >
            <View style={styles.backBtnInner}>
              <Text style={styles.backBtnText}>←</Text>
            </View>
          </TouchableOpacity>

          {/* Wishlist button */}
          <Animated.View style={[styles.wishlistBtn, { top: insets.top + 10, transform: [{ scale: heartAnim }] }]}>
            <TouchableOpacity style={styles.backBtnInner} onPress={handleWishlistToggle}>
              <Text style={styles.heartIcon}>{isWishlisted ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Title & Price Row */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.brandText}>{item.brand} · {item.seller}</Text>
            </View>
            <View style={styles.priceStack}>
              <Text style={styles.currentPrice}>${item.currentPrice.toFixed(2)}</Text>
              {savingsPercent > 0 && (
                <>
                  <Text style={styles.originalPrice}>${item.originalPrice.toFixed(2)}</Text>
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>-{savingsPercent}%</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Quick Meta */}
          <View style={styles.metaRow}>
            <View style={styles.metaChip}><Text style={styles.metaChipText}>📏 {item.size}</Text></View>
            <View style={styles.metaChip}><Text style={styles.metaChipText}>✨ {item.condition}</Text></View>
            <View style={styles.metaChip}><Text style={styles.metaChipText}>📦 {item.category}</Text></View>
            {item.distance !== undefined && (
              <View style={styles.metaChip}><Text style={styles.metaChipText}>📍 {item.distance}km</Text></View>
            )}
          </View>

          {/* Style tags */}
          <View style={styles.tagRow}>
            {item.styleArchetypes.map((s) => (
              <Tag key={s} label={s} color={STYLE_COLORS[s]} selected />
            ))}
          </View>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key as typeof activeTab)}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {/* Description */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>📝 About This Item</Text>
              <Text style={styles.description}>{item.description}</Text>
              <View style={styles.listingRow}>
                <Text style={styles.listingLabel}>Listed:</Text>
                <Text style={styles.listingValue}>{item.listedDate}</Text>
              </View>
              <View style={styles.listingRow}>
                <Text style={styles.listingLabel}>Seller:</Text>
                <Text style={[styles.listingValue, { color: Colors.primaryLight }]}>{item.seller}</Text>
              </View>
            </GradientCard>

            {/* Quick Deal Metrics */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>🔥 Deal Snapshot</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricBig}>{dealScore}</Text>
                  <Text style={styles.metricLabel}>Deal Score</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricBig, { color: Colors.ecoGreen }]}>{item.sustainabilityScore}</Text>
                  <Text style={styles.metricLabel}>Eco Score</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricBig, { color: Colors.accent }]}>{item.co2Saved}kg</Text>
                  <Text style={styles.metricLabel}>CO₂ Saved</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricBig, { color: Colors.warning }]}>{item.matchScore}%</Text>
                  <Text style={styles.metricLabel}>Vibe Match</Text>
                </View>
              </View>

              {/* Deal Score bar breakdown */}
              <View style={{ marginTop: Spacing.md }}>
                <Text style={styles.dealLabel}>Retail Discount</Text>
                <ProgressBar progress={savingsPercent} height={8} gradient={Colors.gradientPrimary} />
                <Text style={styles.dealLabel}>Sustainability</Text>
                <ProgressBar progress={item.sustainabilityScore} height={8} gradient={Colors.gradientEco} />
                <Text style={styles.dealLabel}>Condition</Text>
                <ProgressBar progress={CONDITION_SCORE[item.condition] || 50} height={8} gradient={Colors.gradientAccent} />
              </View>
            </GradientCard>

            {/* Eco Impact */}
            <GradientCard style={styles.section} gradient={Colors.gradientEco}>
              <Text style={styles.sectionTitle}>🌍 Eco Impact</Text>
              <Text style={styles.ecoDesc}>
                By choosing this thrifted item over a new one, you're contributing to:
              </Text>
              <View style={styles.ecoItems}>
                <View style={styles.ecoItem}>
                  <Text style={styles.ecoEmoji}>💨</Text>
                  <Text style={styles.ecoValue}>{item.co2Saved} kg</Text>
                  <Text style={styles.ecoUnit}>CO₂ not emitted</Text>
                </View>
                <View style={styles.ecoItem}>
                  <Text style={styles.ecoEmoji}>💧</Text>
                  <Text style={styles.ecoValue}>{Math.round(item.co2Saved * 180)}L</Text>
                  <Text style={styles.ecoUnit}>Water saved</Text>
                </View>
                <View style={styles.ecoItem}>
                  <Text style={styles.ecoEmoji}>🌱</Text>
                  <Text style={styles.ecoValue}>{(item.co2Saved / 21).toFixed(2)}</Text>
                  <Text style={styles.ecoUnit}>Trees-equivalent</Text>
                </View>
              </View>
            </GradientCard>
          </View>
        )}

        {/* ── PRICE TAB ── */}
        {activeTab === 'price' && (
          <View style={styles.tabContent}>
            {/* Current Price vs Predicted */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>📈 Price History & Forecast</Text>
              <PriceChart history={item.priceHistory} forecast={forecast} height={160} />
            </GradientCard>

            {/* Optimal window */}
            <GradientCard style={styles.section} gradient={Colors.gradientEco}>
              <Text style={styles.sectionTitle}>⏰ Best Time to Buy</Text>
              <Text style={styles.recommendation}>{optimal.recommendation}</Text>
              <View style={styles.optimalGrid}>
                <View style={styles.optimalItem}>
                  <Text style={styles.optimalLabel}>Best Price</Text>
                  <Text style={styles.optimalValue}>${optimal.bestPrice.toFixed(2)}</Text>
                </View>
                <View style={styles.optimalItem}>
                  <Text style={styles.optimalLabel}>Savings</Text>
                  <Text style={styles.optimalValue}>${optimal.savings.toFixed(2)}</Text>
                </View>
                <View style={styles.optimalItem}>
                  <Text style={styles.optimalLabel}>Best Day</Text>
                  <Text style={styles.optimalValue}>{optimal.bestDay === 0 ? 'Today!' : `Day +${optimal.bestDay}`}</Text>
                </View>
                <View style={styles.optimalItem}>
                  <Text style={styles.optimalLabel}>Save %</Text>
                  <Text style={styles.optimalValue}>{optimal.savingsPercent}%</Text>
                </View>
              </View>
            </GradientCard>

            {/* Predictions with confidence */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 AI Price Predictions</Text>
              <View style={styles.predRow}>
                <View style={styles.predBox}>
                  <Text style={styles.predDays}>7-day</Text>
                  <Text style={styles.predPrice}>${conf7d.predicted.toFixed(2)}</Text>
                  <Text style={styles.predRange}>${conf7d.low.toFixed(2)} – ${conf7d.high.toFixed(2)}</Text>
                  <Text style={styles.predCi}>95% CI</Text>
                  {conf7d.predicted < item.currentPrice
                    ? <Text style={styles.predDown}>▼ Price drops</Text>
                    : <Text style={styles.predUp}>▲ Price rises</Text>}
                </View>
                <View style={styles.predDivider} />
                <View style={styles.predBox}>
                  <Text style={styles.predDays}>30-day</Text>
                  <Text style={styles.predPrice}>${conf30d.predicted.toFixed(2)}</Text>
                  <Text style={styles.predRange}>${conf30d.low.toFixed(2)} – ${conf30d.high.toFixed(2)}</Text>
                  <Text style={styles.predCi}>95% CI</Text>
                  {conf30d.predicted < item.currentPrice
                    ? <Text style={styles.predDown}>▼ Price drops</Text>
                    : <Text style={styles.predUp}>▲ Price rises</Text>}
                </View>
              </View>
            </GradientCard>

            {/* Set Price Alert */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>🔔 Price Alert</Text>
              {hasAlert ? (
                <View style={styles.alertActive}>
                  <Text style={styles.alertActiveText}>✅ You have an active alert for this item.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.alertDesc}>
                    Get notified when price drops to your target. Predicted 7d: ${item.predictedPrice7d.toFixed(2)}
                  </Text>
                  <View style={styles.alertInputRow}>
                    <Text style={styles.alertDollar}>$</Text>
                    <TextInput
                      style={styles.alertInput}
                      keyboardType="decimal-pad"
                      placeholder={item.predictedPrice7d.toFixed(2)}
                      placeholderTextColor={Colors.textMuted}
                      value={alertPrice}
                      onChangeText={setAlertPrice}
                    />
                    <TouchableOpacity onPress={handleSetAlert} activeOpacity={0.85}>
                      <LinearGradient colors={Colors.gradientPrimary as [string,string]} style={styles.alertBtn}>
                        <Text style={styles.alertBtnText}>Set Alert</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </GradientCard>
          </View>
        )}

        {/* ── STYLE FIT TAB ── */}
        {activeTab === 'style' && (
          <View style={styles.tabContent}>
            {/* Match breakdown */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>✨ Why This Matches Your Vibe</Text>
              <View style={styles.matchCircle}>
                <LinearGradient
                  colors={item.matchScore >= 80 ? Colors.gradientEco as [string,string] : Colors.gradientPrimary as [string,string]}
                  style={styles.matchCircleGrad}
                >
                  <Text style={styles.matchCircleNum}>{item.matchScore}%</Text>
                  <Text style={styles.matchCircleLabel}>match</Text>
                </LinearGradient>
              </View>
              <Text style={styles.matchDesc}>
                {item.matchScore >= 85
                  ? "🔥 Exceptional match! This item strongly aligns with your style DNA."
                  : item.matchScore >= 70
                  ? "✨ Great match! This fits well within your aesthetic preferences."
                  : "👍 Decent match. You might enjoy experimenting with this style."}
              </Text>
            </GradientCard>

            {/* Style archetypes */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>🏷️  Style Archetypes</Text>
              {item.styleArchetypes.map((arch) => {
                const userHas = profile.styleArchetypes.includes(arch);
                return (
                  <View key={arch} style={styles.archetypeRow}>
                    <View style={[styles.archChip, { backgroundColor: (STYLE_COLORS[arch] || Colors.primary) + '20' }]}>
                      <View style={[styles.archDot, { backgroundColor: STYLE_COLORS[arch] || Colors.primary }]} />
                      <Text style={[styles.archName, { color: STYLE_COLORS[arch] || Colors.primary }]}>{arch}</Text>
                    </View>
                    {userHas && (
                      <View style={styles.matchedBadge}>
                        <Text style={styles.matchedBadgeText}>✓ Your vibe</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </GradientCard>

            {/* Color palette */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>🎨 Color Palette</Text>
              <View style={styles.colorsRow}>
                {item.colors.map((c, i) => (
                  <View key={i} style={[styles.colorSwatch, { backgroundColor: c }]} />
                ))}
              </View>
            </GradientCard>

            {/* Styling tips */}
            <GradientCard style={styles.section}>
              <Text style={styles.sectionTitle}>💡 Styling Tips</Text>
              {getStylingTips(item).map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipBullet}>•</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </GradientCard>
          </View>
        )}
      </Animated.ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomCta, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={styles.ctaWishlist} onPress={handleWishlistToggle} activeOpacity={0.8}>
          <Text style={styles.ctaWishlistText}>{isWishlisted ? '❤️ Saved' : '🤍 Save'}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} style={{ flex: 1 }}>
          <LinearGradient colors={Colors.gradientPrimary as [string,string]} style={styles.ctaBuy}>
            <Text style={styles.ctaBuyText}>🛍️ View on {item.platform}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getStylingTips(item: FashionItem): string[] {
  const tips: string[] = [];
  if (item.styleArchetypes.includes('Vintage')) {
    tips.push('Pair with modern basics to balance the retro feel.');
    tips.push("Try tucking into high-waisted bottoms for an authentic '90s look.");
  }
  if (item.styleArchetypes.includes('Minimalist')) {
    tips.push('Layer sparingly — let the piece speak for itself.');
    tips.push('Clean sneakers or loafers maintain the streamlined aesthetic.');
  }
  if (item.styleArchetypes.includes('Streetwear')) {
    tips.push('Oversized silhouettes pair well with this piece.');
    tips.push('Chunky sneakers elevate the streetwear quotient.');
  }
  if (item.styleArchetypes.includes('Bohemian')) {
    tips.push('Layer with flowy fabrics and natural textures.');
    tips.push('Accessorize with earthy tones and layered jewelry.');
  }
  if (item.styleArchetypes.includes('Dark Academia')) {
    tips.push('Pair with tailored trousers and oxford shoes.');
    tips.push('Add a leather bag to complete the scholarly aesthetic.');
  }
  if (item.styleArchetypes.includes('Cottagecore')) {
    tips.push('Floral accessories and woven baskets complement this style.');
    tips.push('Linen and natural fabrics work beautifully in this aesthetic.');
  }
  if (tips.length === 0) {
    tips.push('Works well as a statement piece in a neutral outfit.');
    tips.push("Consider the item's texture and volume when building your look.");
    tips.push('Thrift complementary pieces to build a cohesive outfit set.');
  }
  return tips.slice(0, 4);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
  },
  floatingBack: {
    marginRight: Spacing.md,
  },
  floatingBackText: {
    color: Colors.primaryLight,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  floatingTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  floatingHeart: {
    padding: Spacing.xs,
  },
  imageContainer: {
    height: 340,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  matchBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
  },
  matchBadgeGrad: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  matchPct: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  matchLbl: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  platformBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  platformText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
  },
  backBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  wishlistBtn: {
    position: 'absolute',
    right: 16,
  },
  heartIcon: {
    fontSize: 18,
  },
  titleSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  titleLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  itemTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 4,
  },
  brandText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  priceStack: {
    alignItems: 'flex-end',
  },
  currentPrice: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  originalPrice: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textDecorationLine: 'line-through',
  },
  savingsBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 2,
  },
  savingsText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  metaChip: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaChipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabContent: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  listingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  listingLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  listingValue: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  metricCard: {
    alignItems: 'center',
    flex: 1,
  },
  metricBig: {
    color: Colors.primary,
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  metricLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },
  dealLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  ecoDesc: {
    color: '#fff',
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    opacity: 0.9,
  },
  ecoItems: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  ecoItem: {
    alignItems: 'center',
  },
  ecoEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  ecoValue: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  ecoUnit: {
    color: '#fff',
    fontSize: 9,
    opacity: 0.8,
    textAlign: 'center',
  },
  recommendation: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.md,
    lineHeight: 22,
  },
  optimalGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optimalItem: {
    alignItems: 'center',
  },
  optimalLabel: {
    color: '#ffffffaa',
    fontSize: FontSize.xs,
    marginBottom: 2,
  },
  optimalValue: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  predRow: {
    flexDirection: 'row',
  },
  predBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  predDays: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: 4,
  },
  predPrice: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  predRange: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  predCi: {
    color: Colors.textMuted,
    fontSize: 9,
    marginTop: 2,
  },
  predDown: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 4,
  },
  predUp: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 4,
  },
  predDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  alertActive: {
    backgroundColor: Colors.success + '20',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  alertActiveText: {
    color: Colors.success,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  alertDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  alertInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: Spacing.md,
  },
  alertDollar: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginRight: 4,
  },
  alertInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    paddingVertical: Spacing.md,
  },
  alertBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    margin: 4,
  },
  alertBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  matchCircle: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  matchCircleGrad: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCircleNum: {
    color: '#fff',
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  matchCircleLabel: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  matchDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  archetypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  archChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  archDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  archName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  matchedBadge: {
    backgroundColor: Colors.success + '25',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  matchedBadgeText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  colorsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tipRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  tipBullet: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    marginRight: Spacing.sm,
    lineHeight: 22,
  },
  tipText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  bottomCta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    gap: Spacing.md,
  },
  ctaWishlist: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaWishlistText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  ctaBuy: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBuyText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '800',
  },
});
