// ============================================================
// VibeVault – SVG price-history chart
// Plots recorded daily prices on a real date axis (gaps stay
// gaps), marks the lowest recorded price, and can show the price
// model's typical low for the coming days as a dashed line.
// Measures its own width so it fits any container.
// ============================================================

import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { Colors, Fonts, FontSize, Spacing } from '../../constants/theme';
import { PricePoint } from '../../types';
import { formatDate, formatShortDate } from '../../utils/date';
import { formatMoney, formatMoneyWhole } from '../../utils/format';

const PAD = { top: 12, right: 12, bottom: 8, left: 52 };
const DAY = 86_400_000;

interface PriceChartProps {
  history: PricePoint[];
  currency: string;
  /** The model's typical lowest price over the coming days (dashed line). */
  expectedLow?: number | null;
  expectedLowLabel?: string;
  height?: number;
}

type Point = { x: number; y: number };

function linePath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

/** Splits the series wherever more than 3 days are missing, so gaps aren't drawn as lines. */
function segments(history: PricePoint[]): PricePoint[][] {
  const out: PricePoint[][] = [];
  let current: PricePoint[] = [];
  for (const p of history) {
    const prev = current[current.length - 1];
    if (prev && Date.parse(p.date) - Date.parse(prev.date) > 3 * DAY) {
      out.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length) out.push(current);
  return out;
}

export default function PriceChart({ history, currency, expectedLow = null, expectedLowLabel = 'Typical low ahead', height = 140 }: PriceChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  if (history.length < 2) {
    return (
      <Text style={styles.noData}>
        {history.length === 1
          ? `Tracking started ${formatShortDate(history[0].date)} at ${formatMoney(history[0].price, currency)}. The chart fills in as prices are recorded each day.`
          : 'No price history recorded yet.'}
      </Text>
    );
  }

  const prices = history.map((p) => p.price);
  const values = expectedLow !== null ? [...prices, expectedLow] : prices;
  const minPrice = Math.min(...values) * 0.97;
  const maxPrice = Math.max(...values) * 1.03;
  const range = maxPrice - minPrice || 1;
  const t0 = Date.parse(history[0].date);
  const t1 = Date.parse(history[history.length - 1].date);
  const span = Math.max(DAY, t1 - t0);

  const svgHeight = height + PAD.top + PAD.bottom;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const x = (date: string) => PAD.left + ((Date.parse(date) - t0) / span) * plotW;
  const y = (price: number) => PAD.top + height - ((price - minPrice) / range) * height;
  const bottomY = PAD.top + height;
  const gridPrices = [maxPrice, (maxPrice + minPrice) / 2, minPrice];
  // Long histories (archived prices) span years, so the axis shows them.
  const axisDate = t1 - t0 > 300 * DAY ? formatDate : formatShortDate;

  const lowest = history.reduce((best, p) => (p.price < best.price ? p : best), history[0]);
  const latest = history[history.length - 1];
  const summary = `Price history, ${history.length} recorded days. Latest ${formatMoney(latest.price, currency)}; lowest ${formatMoney(
    lowest.price,
    currency,
  )} on ${formatShortDate(lowest.date)}${expectedLow !== null ? `; ${expectedLowLabel.toLowerCase()} ${formatMoney(expectedLow, currency)}` : ''}.`;

  return (
    <View style={styles.container} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {width > 0 ? (
        <>
          <Svg width={width} height={svgHeight}>
            <Defs>
              <SvgGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colors.ink} stopOpacity="0.10" />
                <Stop offset="1" stopColor={Colors.ink} stopOpacity="0.0" />
              </SvgGradient>
            </Defs>

            {gridPrices.map((gp, i) => (
              <Line key={i} x1={PAD.left} y1={y(gp)} x2={width - PAD.right} y2={y(gp)} stroke={Colors.border} strokeWidth="1" strokeDasharray="4,4" />
            ))}

            {segments(history).map((seg, i) => {
              const pts = seg.map((p) => ({ x: x(p.date), y: y(p.price) }));
              if (pts.length < 2) return <Circle key={i} cx={pts[0].x} cy={pts[0].y} r="2" fill={Colors.ink} />;
              return (
                <React.Fragment key={i}>
                  <Path d={`${linePath(pts)} L ${pts[pts.length - 1].x.toFixed(1)} ${bottomY} L ${pts[0].x.toFixed(1)} ${bottomY} Z`} fill="url(#historyFill)" />
                  <Path d={linePath(pts)} fill="none" stroke={Colors.ink} strokeWidth="2" strokeLinejoin="round" />
                </React.Fragment>
              );
            })}

            {expectedLow !== null && (
              <Line x1={PAD.left} y1={y(expectedLow)} x2={width - PAD.right} y2={y(expectedLow)} stroke={Colors.wait} strokeWidth="1.5" strokeDasharray="6,4" />
            )}
            <Circle cx={x(lowest.date)} cy={y(lowest.price)} r="4" fill={Colors.buy} />
            <Circle cx={x(latest.date)} cy={y(latest.price)} r="5" fill={Colors.ink} />
            <Circle cx={x(latest.date)} cy={y(latest.price)} r="3" fill="#fff" />
          </Svg>

          <View style={[StyleSheet.absoluteFill, styles.noPointer]}>
            {gridPrices.map((gp, i) => (
              <Text key={i} style={[styles.yLabel, { top: y(gp) - 7 }]}>
                {formatMoneyWhole(gp, currency)}
              </Text>
            ))}
          </View>

          <View style={styles.dateRow}>
            <Text style={[styles.dateText, { left: PAD.left }]}>{axisDate(history[0].date)}</Text>
            <Text style={[styles.dateText, { right: PAD.right }]}>{axisDate(latest.date)}</Text>
          </View>

          <View style={styles.legend}>
            <View style={[styles.legendLine, { backgroundColor: Colors.ink }]} />
            <Text style={styles.legendText}>Recorded</Text>
            <View style={[styles.legendDot, { backgroundColor: Colors.buy, marginLeft: Spacing.md }]} />
            <Text style={styles.legendText}>Lowest</Text>
            {expectedLow !== null && (
              <>
                <View style={[styles.legendLine, { backgroundColor: Colors.wait, marginLeft: Spacing.md }]} />
                <Text style={styles.legendText}>{expectedLowLabel}</Text>
              </>
            )}
          </View>
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
  noData: { fontFamily: Fonts.regular, color: Colors.textMuted, fontSize: FontSize.sm, paddingVertical: Spacing.lg, textAlign: 'center' },
  yLabel: { position: 'absolute', left: 0, width: 48, fontFamily: Fonts.regular, color: Colors.textMuted, fontSize: 10, textAlign: 'right' },
  dateRow: { height: 16, marginTop: 2 },
  dateText: { position: 'absolute', top: 0, fontFamily: Fonts.regular, color: Colors.textMuted, fontSize: FontSize.xs },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm, gap: 4, flexWrap: 'wrap' },
  legendLine: { width: 16, height: 2.5, borderRadius: 2 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: Fonts.regular, color: Colors.textSecondary, fontSize: FontSize.xs, marginRight: 4 },
});
