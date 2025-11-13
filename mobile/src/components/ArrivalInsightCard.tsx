import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArrivalIntent } from '../api';
import { colors, radius, spacing } from '../config/theme';

type Props = {
  intent?: ArrivalIntent;
};

function formatTraffic(value?: ArrivalIntent['traffic_condition'] | null) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ArrivalInsightCard({ intent }: Props) {
  if (!intent) return null;
  const hasDistance = typeof intent.route_distance_km === 'number';
  const etaMinutes = intent.predicted_eta_minutes ?? intent.typical_eta_minutes ?? null;
  const hasTraffic = Boolean(intent.traffic_condition);
  const hasSummary = Boolean(intent.route_summary);
  const provider = intent.traffic_source ?? 'gomap';
  const providerLabel = provider === 'osrm'
    ? 'Calibrated route'
    : provider === 'fallback'
    ? 'Estimated route'
    : 'GoMap live route';

  if (!hasDistance && !etaMinutes && !hasTraffic && !hasSummary) {
    return null;
  }

  const updatedLabel = intent.last_signal
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
        new Date(intent.last_signal),
      )
    : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{providerLabel}</Text>
      <View style={styles.metricsRow}>
        {hasDistance ? (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{intent.route_distance_km!.toFixed(1)} km</Text>
          </View>
        ) : null}
        {etaMinutes ? (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>ETA</Text>
            <Text style={styles.metricValue}>{etaMinutes} min</Text>
          </View>
        ) : null}
        {hasTraffic ? (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Traffic</Text>
            <Text style={styles.metricValue}>{formatTraffic(intent.traffic_condition)}</Text>
          </View>
        ) : null}
      </View>
      {intent.route_summary ? <Text style={styles.summary}>{intent.route_summary}</Text> : null}
      {updatedLabel ? <Text style={styles.timestamp}>Updated {updatedLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metric: {
    flexShrink: 0,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summary: {
    color: colors.text,
    fontSize: 13,
  },
  timestamp: {
    fontSize: 11,
    color: colors.muted,
  },
});
