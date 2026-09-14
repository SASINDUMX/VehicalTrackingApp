import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  LogIn,
  AlertCircle,
} from 'lucide-react-native';

const appLogo = require('../../../assets/icon.png');

export const LoginScreen: React.FC = () => {
  const { signIn } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={[styles.logoCircleOuter, { backgroundColor: colors.primaryDim }]}>
            <View style={[styles.logoCircleInner, { backgroundColor: '#0b0f19', borderColor: colors.primaryBorder, borderWidth: 1 }]}>
              <Image
                source={appLogo}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
          </View>
          <Text style={[styles.appTitle, { color: colors.textPrimary }]}>UNITED MOTORS</Text>
          <Text style={[styles.appSubtitle, { color: colors.textMuted }]}>Vehicle Tracking System</Text>
        </View>

        {/* Login Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderGlass }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Sign In</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>Enter your credentials to access the system</Text>
          </View>

          {/* Error Banner */}
          {error && (
            <View style={[styles.errorBanner, { backgroundColor: colors.dangerDim, borderColor: colors.dangerBorder }]}>
              <AlertCircle size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={styles.formSection}>
            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: colors.borderGlass,
                    color: colors.textPrimary,
                  }
                ]}
                placeholder="your.name@unitedmotors.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={(text) => { setEmail(text); setError(null); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!isLoading}
              />
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: colors.borderGlass,
                    color: colors.textPrimary,
                  }
                ]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={(text) => { setPassword(text); setError(null); }}
                secureTextEntry
                autoComplete="password"
                editable={!isLoading}
                onSubmitEditing={handleSignIn}
              />
            </View>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.signInBtn, { backgroundColor: colors.primary }, isLoading && styles.signInBtnDisabled, isLoading && (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {})]}
            onPress={() => { if (!isLoading) handleSignIn(); }}
            activeOpacity={isLoading ? 1 : 0.7}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <LogIn size={18} color="#ffffff" />
                <Text style={styles.signInText}>Login</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={[styles.footer, { color: colors.textMuted }]}>
          v1.1
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircleOuter: {
    width: 90,
    height: 90,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoCircleInner: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 68,
    height: 68,
    borderRadius: 20,
  },
  appTitle: {
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: 2.5,
  },
  appSubtitle: {
    fontSize: 14,
    marginTop: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.5)' } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.5,
          shadowRadius: 16,
          elevation: 10,
        }),
  },
  cardHeader: {
    marginBottom: 24,
  },
  cardTitle: {
    fontWeight: '800',
    fontSize: 22,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    flex: 1,
  },
  formSection: {
    gap: 18,
    marginBottom: 24,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
  },
  signInBtnDisabled: {
    opacity: 0.6,
  },
  signInText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  footer: {
    fontSize: 12,
    marginTop: 32,
    letterSpacing: 0.5,
  },
});
