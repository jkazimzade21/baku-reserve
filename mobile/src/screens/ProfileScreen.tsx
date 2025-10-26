import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing } from '../config/theme';
import Surface from '../components/Surface';
import InfoBanner from '../components/InfoBanner';

const languages = ['Azerbaijani', 'English', 'Russian'] as const;

export default function ProfileScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState<typeof languages[number]>('Azerbaijani');
  const [pushNotifications, setPushNotifications] = useState(true);
  const [seatPreference, setSeatPreference] = useState<'window' | 'quiet' | 'none'>('window');
  const [autoAddCalendar, setAutoAddCalendar] = useState(true);

  const contactSupport = () => {
    Linking.openURL('mailto:support@bakureserve.az?subject=Support%20request');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[`${colors.accent}33`, 'transparent']}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          <View style={styles.heroHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>AZ</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroName}>Guest profile</Text>
              <Text style={styles.heroSubtitle}>
                Manage preferences, notifications, and concierge access for faster bookings.
              </Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <Pressable style={styles.heroActionButton} onPress={contactSupport}>
              <Feather name="headphones" size={16} color={colors.primaryStrong} />
              <Text style={styles.heroActionText}>Message concierge</Text>
            </Pressable>
            <Pressable style={styles.heroActionButton} onPress={() => setAutoAddCalendar(true)}>
              <Feather name="calendar" size={16} color={colors.primaryStrong} />
              <Text style={styles.heroActionText}>Sync calendar</Text>
            </Pressable>
          </View>
        </View>

        <InfoBanner
          tone="info"
          icon="star"
          title="Member perks"
          message="Enable push updates to get instant alerts when high-demand tables release."
        />

        <Surface tone="overlay" padding="lg" style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Push updates</Text>
              <Text style={styles.rowSubtitle}>Seat releases, reminders, and concierge messages.</Text>
            </View>
            <Switch
              value={pushNotifications}
              onValueChange={setPushNotifications}
              thumbColor={pushNotifications ? colors.primaryStrong : '#fff'}
              trackColor={{ false: colors.secondary, true: 'rgba(37,99,235,0.35)' }}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Add to calendar</Text>
              <Text style={styles.rowSubtitle}>Automatically save confirmed reservations to your calendar.</Text>
            </View>
            <Switch
              value={autoAddCalendar}
              onValueChange={setAutoAddCalendar}
              thumbColor={autoAddCalendar ? colors.primaryStrong : '#fff'}
              trackColor={{ false: colors.secondary, true: 'rgba(37,99,235,0.35)' }}
            />
          </View>
        </Surface>

        <Surface tone="overlay" padding="lg" style={styles.section}>
          <Text style={styles.sectionTitle}>Dining preferences</Text>
          <View style={styles.preferenceGroup}>
            <Text style={styles.rowTitle}>Seat preference</Text>
            <View style={styles.choiceRow}>
              {(['window', 'quiet', 'none'] as const).map((option) => (
                <PreferenceChip
                  key={option}
                  label={labelForSeat(option)}
                  active={seatPreference === option}
                  onPress={() => setSeatPreference(option)}
                />
              ))}
            </View>
          </View>
          <View style={styles.preferenceGroup}>
            <Text style={styles.rowTitle}>App language</Text>
            <View style={styles.choiceRow}>
              {languages.map((language) => (
                <PreferenceChip
                  key={language}
                  label={language}
                  active={selectedLanguage === language}
                  onPress={() => setSelectedLanguage(language)}
                />
              ))}
            </View>
          </View>
        </Surface>

        <Surface tone="overlay" padding="lg" style={styles.section}>
          <Text style={styles.sectionTitle}>Concierge & support</Text>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Priority concierge</Text>
              <Text style={styles.rowSubtitle}>
                Need a rare table? Reply to any confirmation email and our team will call within 10 minutes.
              </Text>
            </View>
            <Feather name="message-circle" size={18} color={colors.primaryStrong} />
          </View>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Chat with support</Text>
              <Text style={styles.rowSubtitle}>We answer daily from 10:00 – 02:00 (including weekends).</Text>
            </View>
            <Feather name="mail" size={18} color={colors.primaryStrong} onPress={contactSupport} />
          </View>
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

type PreferenceChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function PreferenceChip({ label, active, onPress }: PreferenceChipProps) {
  return (
    <Text
      onPress={onPress}
      style={[
        styles.preferenceChip,
        active && styles.preferenceChipActive,
      ]}
    >
      {label}
    </Text>
  );
}

function labelForSeat(value: 'window' | 'quiet' | 'none') {
  switch (value) {
    case 'window':
      return 'Window view';
    case 'quiet':
      return 'Quiet corner';
    default:
      return 'No preference';
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  heroSection: {
    position: 'relative',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: `${colors.card}CC`,
    borderWidth: 1,
    borderColor: `${colors.border}80`,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  heroSubtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  heroActionText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontWeight: '600',
    color: colors.text,
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  preferenceGroup: {
    gap: spacing.sm,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preferenceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    color: colors.muted,
    fontWeight: '600',
  },
  preferenceChipActive: {
    backgroundColor: colors.primaryStrong,
    color: '#fff',
  },
});
