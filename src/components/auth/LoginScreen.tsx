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
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Car, LogIn, AlertCircle, Shield, Wrench, Headphones, UserCheck } from 'lucide-react-native';

export const LoginScreen: React.FC = () => {
  const { signIn } = useAuth();
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

  const fillQuickAccount = (role: 'supervisor' | 'tech1' | 'tech2' | 'tech3' | 'advisor') => {
    switch (role) {
      case 'supervisor':
        setEmail('supervisor@unitedmotors.com');
        setPassword('Super@123');
        break;
      case 'tech1':
        setEmail('tech1@unitedmotors.com');
        setPassword('Tech1@123');
        break;
      case 'tech2':
        setEmail('tech2@unitedmotors.com');
        setPassword('Tech2@123');
        break;
      case 'tech3':
        setEmail('tech3@unitedmotors.com');
        setPassword('Tech3@123');
        break;
      case 'advisor':
        setEmail('advisor@unitedmotors.com');
        setPassword('Advisor@123');
        break;
    }
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircleOuter}>
            <View style={styles.logoCircleInner}>
              <Car size={40} color="#ffffff" />
            </View>
          </View>
          <Text style={styles.appTitle}>UNITED MOTORS</Text>
          <Text style={styles.appSubtitle}>Vehicle Tracking System</Text>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSubtitle}>Enter your credentials to access the system</Text>
          </View>

          {/* Error Banner */}
          {error && (
            <View style={styles.errorBanner}>
              <AlertCircle size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={styles.formSection}>
            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="your.name@unitedmotors.com"
                placeholderTextColor="#64748b"
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
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
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
            style={[styles.signInBtn, isLoading && styles.signInBtnDisabled, isLoading && (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {})]}
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

          {/* Quick Test Accounts */}
          <View style={styles.quickAccountsSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Quick Demo Accounts</Text>
              <View style={styles.dividerLine} />
            </View>
            
            <View style={styles.pillsContainer}>
              <TouchableOpacity style={styles.pill} onPress={() => { if (!isLoading) fillQuickAccount('supervisor'); }} activeOpacity={isLoading ? 1 : 0.7}>
                <Shield size={13} color="#0ea5e9" />
                <Text style={styles.pillText}>Supervisor</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pill} onPress={() => { if (!isLoading) fillQuickAccount('tech1'); }} activeOpacity={isLoading ? 1 : 0.7}>
                <Wrench size={13} color="#06b6d4" />
                <Text style={styles.pillText}>Tech 1 (General)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pill} onPress={() => { if (!isLoading) fillQuickAccount('tech2'); }} activeOpacity={isLoading ? 1 : 0.7}>
                <UserCheck size={13} color="#10b981" />
                <Text style={styles.pillText}>Tech 2 (Alignment)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pill} onPress={() => { if (!isLoading) fillQuickAccount('tech3'); }} activeOpacity={isLoading ? 1 : 0.7}>
                <Shield size={13} color="#f59e0b" />
                <Text style={styles.pillText}>Tech 3 (Hoist)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pill} onPress={() => { if (!isLoading) fillQuickAccount('advisor'); }} activeOpacity={isLoading ? 1 : 0.7}>
                <Headphones size={13} color="#a855f7" />
                <Text style={styles.pillText}>Advisor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          v1.0
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b14', // Ultra-premium carbon dark backdrop
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
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 0px 20px rgba(6, 182, 212, 0.8)' } as any)
      : {
          shadowColor: '#06b6d4',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 20,
          elevation: 12,
        }),
  },
  logoCircleInner: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: 2.5,
  },
  appSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a', // Floating glassmorphic card
    borderRadius: 20, // Radius 20
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)', // Border
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
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 22,
    marginBottom: 4,
  },
  cardSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorText: {
    color: '#fca5a5',
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
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 16,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#06b6d4',
    paddingVertical: 16,
    borderRadius: 12,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 4px 8px rgba(6, 182, 212, 0.3)' } as any)
      : {
          shadowColor: '#06b6d4',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6,
        }),
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
  quickAccountsSection: {
    marginTop: 28,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillText: {
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    color: '#475569',
    fontSize: 12,
    marginTop: 32,
    letterSpacing: 0.5,
  },
});
