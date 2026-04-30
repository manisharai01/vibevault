// ============================================================
// VibeVault – SVG Price Chart Component
// Line chart with gradient fill using react-native-svg.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Line, Circle } from 'react-native-svg';
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { PricePoint } from '../../types';

const CHART_PADDING = { top: 12, right: 16, bottom: 24, left: 44 };

interface PriceChartProps {
  history: PricePoint[];
  forecast?: PricePoint[];
  height?: number;
  showLabels?: boolean;
}

export default function PriceChart({
  history,
  forecast = [],
  height = 140,
  showLabels = true,
}: PriceChartProps) {
  const containerWidth = Dimensions.get('window').width - Spacing.lg * 2 - Spacing.lg * 2;
  const allPoints = [...history, ...forecast];
  if (allPoints.length < 2) return null;

  const svgWidth = containerWidth;
  const svgHeight = height + CHART_PADDING.top + CHART_PADDING.bottom;
  const plotW = svgWidth - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = height;

  const prices = allPoints.map((p) => p.price);
  const minPrice = Math.min(...prices) * 0.95;
  const maxPrice = Math.max(...prices) * 1.05;
  const priceRange = maxPrice - minPrice || 1;

  const getX = (i: number, total: number) =>
    CHART_PADDING.left + (i / (total - 1)) * plotW;

  const getY = (price: number) =>
    CHART_PADDING.top + plotH - ((price - minPrice) / priceRange) * plotH;

  // Build smooth cubic bezier path
  const buildPath = (points: { x: number; y: number }[]): string => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    return d;
  };

  const buildFillPath = (points: { x: number; y: number }[], bottom: number): string => {
    if (points.length < 2) return '';
    const linePath = buildPath(points);
    const lastX = points[points.length - 1].x.toFixed(1);
    const firstX = points[0].x.toFixed(1);
    return `${linePath} L ${lastX} ${bottom} L ${firstX} ${bottom} Z`;
  };

  const historyCoords = history.map((p, i) => ({
    x: getX(i, allPoints.length),
    y: getY(p.price),
  }));

  const forecastCoords = forecast.map((p, i) => ({
    x: getX(history.length + i, allPoints.length),
    y: getY(p.price),
  }));

  const splitX = history.length > 0
    ? getX(history.length - 1, allPoints.length)
    : CHART_PADDING.left;

  const bottomY = CHART_PADDING.top + plotH;

  const gridPrices = [
    maxPrice,
    (maxPrice + minPrice) / 2,
    minPrice,
  ];

  // Current price dot (last history point)
  const lastHistoryCoord = historyCoords[historyCoords.length - 1];

  return (
    <View style={styles.container}>
      <Svg width={svgWidth} height={svgHeight}>
        <Defs>
          <SvgGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.primary} stopOpacity="0.35" />
            <Stop offset="1" stopColor={Colors.primary} stopOpacity="0.01" />
          </SvgGradient>
          <SvgGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.accent} stopOpacity="0.35" />
            <Stop offset="1" stopColor={Colors.accent} stopOpacity="0.01" />
          </SvgGradient>
        </Defs>

        {/* Grid lines & Y labels */}
        {gridPrices.map((gp, i) => {
          const gy = getY(gp);
          return (
            <React.Fragment key={i}>
              <Line
                x1={CHART_PADDING.left}
                y1={gy}
                x2={svgWidth - CHART_PADDING.right}
                y2={gy}
                stroke={Colors.border}
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            </React.Fragment>
          );
        })}

        {/* History fill */}
        {historyCoords.length >= 2 && (
          <Path
            d={buildFillPath(historyCoords, bottomY)}
            fill="url(#historyFill)"
          />
        )}

        {/* Forecast fill */}
        {forecastCoords.length >= 2 && (
          <Path
            d={buildFillPath(
              [historyCoords[historyCoords.length - 1], ...forecastCoords],
              bottomY,
            )}
            fill="url(#forecastFill)"
          />
        )}

        {/* History line */}
        {historyCoords.length >= 2 && (
          <Path
            d={buildPath(historyCoords)}
            fill="none"
            stroke={Colors.primary}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Forecast line */}
        {forecastCoords.length >= 2 && (
          <Path
            d={buildPath([historyCoords[historyCoords.length - 1], ...forecastCoords])}
            fill="none"
            stroke={Colors.accent}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6,3"
          />
        )}

        {/* Today divider */}
        {forecast.length > 0 && (
          <Line
            x1={splitX}
            y1={CHART_PADDING.top}
            x2={splitX}
            y2={bottomY}
            stroke={Colors.warning}
            strokeWidth="1.5"
            strokeDasharray="4,3"
          />
        )}

        {/* Current price dot */}
        {lastHistoryCoord && (
          <>
            <Circle cx={lastHistoryCoord.x} cy={lastHistoryCoord.y} r="5" fill={Colors.primary} />
            <Circle cx={lastHistoryCoord.x} cy={lastHistoryCoord.y} r="3" fill="#fff" />
          </>
        )}
      </Svg>

      {/* Y-axis labels (absolute overlay) */}
      <View style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' }]}>
        {gridPrices.map((gp, i) => {
          const relY = ((maxPrice - gp) / priceRange) * plotH + CHART_PADDING.top;
          return (
            <Text
              key={i}
              style={[styles.yLabel, { top: relY - 7, left: 0 }]}
            >
              ${gp.toFixed(0)}
            </Text>
          );
        })}
      </View>

      {/* Date labels */}
      {showLabels && (
        <View style={[styles.dateRow, { paddingLeft: CHART_PADDING.left, paddingRight: CHART_PADDING.right }]}>
          <Text style={styles.dateText}>30d ago</Text>
          {forecast.length > 0 && (
            <Text style={[styles.dateText, { color: Colors.warning }]}>Today</Text>
          )}
          {forecast.length > 0 && (
            <Text style={[styles.dateText, { color: Colors.accent }]}>+{forecast.length}d</Text>
          )}
        </View>
      )}

      {/* Legend */}
      {forecast.length > 0 && (
        <View style={styles.legend}>
          <View style={[styles.legendLine, { backgroundColor: Colors.primary }]} />
          <Text style={styles.legendText}>History</Text>
          <View style={[styles.legendLine, { backgroundColor: Colors.accent, marginLeft: Spacing.md }]} />
          <Text style={styles.legendText}>Forecast</Text>
          <View style={[styles.legendDot, { backgroundColor: Colors.warning, marginLeft: Spacing.md }]} />
          <Text style={styles.legendText}>Today</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  yLabel: {
    position: 'absolute',
    color: Colors.textMuted,
    fontSize: 9,
    width: 40,
    textAlign: 'right',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  dateText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    gap: 4,
  },
  legendLine: {
    width: 16,
    height: 2.5,
    borderRadius: 2,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginRight: 4,
  },
});
