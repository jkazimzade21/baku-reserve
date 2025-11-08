import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing } from '../config/theme';
import Surface from '../components/Surface';
import InfoBanner from '../components/InfoBanner';
import { signupUser, requestLoginOtp, loginWithOtp } from '../api';

const languages = ['Azerbaijani', 'English', 'Russian'] as const;

export default function ProfileScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState<typeof languages[number]>('Azerbaijani');
  const [pushNotifications, setPushNotifications] = useState(true);
  const [seatPreference, setSeatPreference] = useState<'window' | 'quiet' | 'none'>('window');
  const [autoAddCalendar, setAutoAddCalendar] = useState(true);
  const [name, setName] = useState('Mobile Guest');
  const [email, setEmail] = useState('guest@example.com');
  const [phone, setPhone] = useState('+99450XXXXXXX');
  const [otp, setOtp] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<'signup' | 'otp' | 'login' | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const contactSupport = () => {
    Linking.openURL('mailto:support@bakureserve.az?subject=Support%20request');
  };

  const handleSignup = async () => {
    try {
      setAuthLoading('signup');
      setAuthMessage(null);
      const res = await signupUser({ name, email, phone });
      setAuthMessage(`OTP sent: ${res.otp}`);
    } catch (err: any) {
      setAuthMessage(err.message || 'Could not save profile');
    } finally {
      setAuthLoading(null);
    }
  };

  const handleOtpRequest = async () => {
    try {
      setAuthLoading('otp');
      setAuthMessage(null);
      const res = await requestLoginOtp(email);
      setAuthMessage(`OTP refreshed: ${res.otp}`);
    } catch (err: any) {
      setAuthMessage(err.message || 'Unable to send code');
    } finally {
      setAuthLoading(null);
    }
  };

  const handleLogin = async () => {
    try {
      setAuthLoading('login');
      setAuthMessage(null);
      const res = await loginWithOtp(email, otp);
      setSessionToken(res.token);
      setAuthMessage('Session verified. Welcome back!');
    } catch (err: any) {
      setAuthMessage(err.message || 'Invalid code');
    } finally {
      setAuthLoading(null);
    }
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
              <Text style={styles.avatarText}>{name.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroName}>{name || 'Guest profile'}</Text>
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
          <Text style={styles.sectionTitle}>Account & contact</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput
            style={styles.input}
            placeholder="6-digit OTP"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
          />
          {authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}
          {sessionToken ? (
            <Text style={styles.sessionToken}>Session token: {sessionToken.slice(0, 12)}…</Text>
          ) : null}
          <View style={styles.authButtonRow}>
            <Pressable
              style={[styles.authButton, authLoading === 'signup' && styles.authButtonDisabled]}
              onPress={handleSignup}
              disabled={authLoading === 'signup'}
            >
              <Text style={styles.authButtonText}>
                {authLoading === 'signup' ? 'Saving…' : 'Save contact info'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.authButton, authLoading === 'otp' && styles.authButtonDisabled]}
              onPress={handleOtpRequest}
              disabled={authLoading === 'otp'}
            >
              <Text style={styles.authButtonText}>
                {authLoading === 'otp' ? 'Sending…' : 'Send login code'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.authButtonPrimary, authLoading === 'login' && styles.authButtonDisabled]}
              onPress={handleLogin}
              disabled={authLoading === 'login'}
            >
              <Text style={styles.authButtonPrimaryText}>
                {authLoading === 'login' ? 'Verifying…' : 'Verify & login'}
              </Text>
            </Pressable>
          </View>
        </Surface>

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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  authMessage: {
    fontSize: 12,
    color: colors.primaryStrong,
  },
  sessionToken: {
    fontSize: 12,
    color: colors.muted,
  },
  authButtonRow: {
    gap: spacing.sm,
  },
  authButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  authButtonPrimary: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
  },
  authButtonText: {
    fontWeight: '600',
    color: colors.text,
  },
  authButtonPrimaryText: {
    fontWeight: '700',
    color: '#fff',
  },
  authButtonDisabled: {
    opacity: 0.5,
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
