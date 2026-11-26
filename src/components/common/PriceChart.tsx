// ============================================================
// VibeVault – SVG Price Chart Component
// History + forecast line chart with gradient fills. Measures its
// own width so it fits any container.
// ============================================================

import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { PricePoint } from '../../types';
import { formatShortDate } from '../../utils/date';
import { currencySymbol, formatMoney } from '../../utils/format';

const PAD = { top: 12, right: 12, bottom: 8, left: 44 };

interface PriceChartProps {
  history: PricePoint[];
  forecast?: PricePoint[];
  currency: string;
  height?: number;
}

function axisMoney(value: number, currency: string): string {
  return currency === 'INR' ? formatMoney(Math.round(value), 'INR') : `${currencySymbol(currency)}${Math.round(value)}`;
}

type Point = { x: number; y: number };

function smoothPath(points: Point[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` C ${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  return d;
}

function fillPath(points: Point[], bottom: number): string {
  if (points.length < 2) return '';
  const first = points[0].x.toFixed(1);
  const last = points[points.length - 1].x.toFixed(1);
  return `${smoothPath(points)} L ${last} ${bottom} L ${first} ${bottom} Z`;
}

export default function PriceChart({ history, forecast = [], currency, height = 140 }: PriceChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const all = [...history, ...forecast];
  if (all.length < 2) {
    return (
      <Text style={styles.noData}>
        {history.length === 1
          ? `Tracking started ${formatShortDate(history[0].date)} at ${formatMoney(history[0].price, currency)}. The chart fills in as prices are recorded each day.`
          : 'No price history recorded yet.'}
      </Text>
    );
  }

  const prices = all.map((p) => p.price);
  const minPrice = Math.min(...prices) * 0.95;
  const maxPrice = Math.max(...prices) * 1.05;
  const range = maxPrice - minPrice || 1;

  const svgHeight = height + PAD.top + PAD.bottom;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const x = (i: number) => PAD.left + (i / (all.length - 1)) * plotW;
  const y = (price: number) => PAD.top + height - ((price - minPrice) / range) * height;
  const bottomY = PAD.top + height;

  const historyPts = history.map((p, i) => ({ x: x(i), y: y(p.price) }));
  const lastHistory = historyPts[historyPts.length - 1];
  const forecastPts = lastHistory ? [lastHistory, ...forecast.map((p, i) => ({ x: x(history.length + i), y: y(p.price) }))] : [];
  const splitX = lastHistory ? lastHistory.x : PAD.left;
  const gridPrices = [maxPrice, (maxPrice + minPrice) / 2, minPrice];

  const current = history[history.length - 1]?.price;
  const lastForecast = forecast[forecast.length - 1]?.price;
  const summary =
    current !== undefined
      ? `Price chart. Latest price ${formatMoney(current, currency)}${
          lastForecast !== undefined ? `, forecast ${formatMoney(lastForecast, currency)} in ${forecast.length} days` : ''
        }.`
      : 'Price chart.';

  return (
    <View style={styles.container} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {width > 0 ? (
        <>
          <Svg width={width} height={svgHeight}>
            <Defs>
              <SvgGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colors.primary} stopOpacity="0.35" />
                <Stop offset="1" stopColor={Colors.primary} stopOpacity="0.01" />
              </SvgGradient>
              <SvgGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colors.accent} stopOpacity="0.3" />
                <Stop offset="1" stopColor={Colors.accent} stopOpacity="0.01" />
              </SvgGradient>
            </Defs>

            {gridPrices.map((gp, i) => (
              <Line
                key={i}
                x1={PAD.left}
                y1={y(gp)}
                x2={width - PAD.right}
                y2={y(gp)}
                stroke={Colors.border}
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            ))}

            {historyPts.length >= 2 && <Path d={fillPath(historyPts, bottomY)} fill="url(#historyFill)" />}
            {forecastPts.length >= 2 && <Path d={fillPath(forecastPts, bottomY)} fill="url(#forecastFill)" />}
            {historyPts.length >= 2 && (
              <Path d={smoothPath(historyPts)} fill="none" stroke={Colors.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {forecastPts.length >= 2 && (
              <Path
                d={smoothPath(forecastPts)}
                fill="none"
                stroke={Colors.accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6,3"
              />
            )}
            {forecast.length > 0 && (
              <Line x1={splitX} y1={PAD.top} x2={splitX} y2={bottomY} stroke={Colors.warning} strokeWidth="1.5" strokeDasharray="4,3" />
            )}
            {lastHistory && (
              <>
                <Circle cx={lastHistory.x} cy={lastHistory.y} r="5" fill={Colors.primary} />
                <Circle cx={lastHistory.x} cy={lastHistory.y} r="3" fill="#fff" />
              </>
            )}
          </Svg>

          {/* Y-axis labels */}
          <View style={[StyleSheet.absoluteFill, styles.noPointer]}>
            {gridPrices.map((gp, i) => (
              <Text key={i} style={[styles.yLabel, { top: y(gp) - 7 }]}>
                {axisMoney(gp, currency)}
              </Text>
            ))}
          </View>

          {/* X-axis labels */}
          <View style={styles.dateRow}>
            <Text style={[styles.dateText, { left: PAD.left }]}>{history[0] ? formatShortDate(history[0].date) : ''}</Text>
            {forecast.length > 0 ? (
              <Text style={[styles.dateText, styles.todayText, { left: Math.max(PAD.left + 44, Math.min(splitX - 18, width - 80)) }]}>
                Latest
              </Text>
            ) : (
              history.length > 1 && (
                <Text style={[styles.dateText, { right: PAD.right }]}>{formatShortDate(history[history.length - 1].date)}</Text>
              )
            )}
            {forecast.length > 0 && <Text style={[styles.dateText, styles.forecastText, { right: PAD.right }]}>+{forecast.length}d</Text>}
          </View>

          {forecast.length > 0 && (
            <View style={styles.legend}>
              <View style={[styles.legendLine, { backgroundColor: Colors.primary }]} />
              <Text style={styles.legendText}>History</Text>
              <View style={[styles.legendLine, { backgroundColor: Colors.accent, marginLeft: Spacing.md }]} />
              <Text style={styles.legendText}>Forecast</Text>
              <View style={[styles.legendDot, { backgroundColor: Colors.warning, marginLeft: Spacing.md }]} />
              <Text style={styles.legendText}>Latest</Text>
            </View>
          )}
        </>
      ) : (
        <View style={{ height: svgHeight }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: Spacing.sm },
  noPointer: { pointerEvents: 'none' },
  noData: { color: Colors.textMuted, fontSize: FontSize.sm, paddingVertical: Spacing.lg, textAlign: 'center' },
  yLabel: { position: 'absolute', left: 0, width: 40, color: Colors.textMuted, fontSize: 9, textAlign: 'right' },
  dateRow: { height: 16, marginTop: 2 },
  dateText: { position: 'absolute', top: 0, color: Colors.textMuted, fontSize: FontSize.xs },
  todayText: { color: Colors.warning },
  forecastText: { color: Colors.accent },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm, gap: 4 },
  legendLine: { width: 16, height: 2.5, borderRadius: 2 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textSecondary, fontSize: FontSize.xs, marginRight: 4 },
});
