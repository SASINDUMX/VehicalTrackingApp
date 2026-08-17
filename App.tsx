import React, { useEffect } from 'react';
import { StyleSheet, View, Text, SafeAreaView, StatusBar, Platform, ActivityIndicator, Animated, Easing } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { VehicleProvider, useVehicles } from './src/context/VehicleContext';
import { LoginScreen } from './src/components/auth/LoginScreen';
import { Header } from './src/components/layout/Header';
import { SearchBarRow, SegmentedTabs } from './src/components/layout/RoleSwitcher';
import { FloorPlan2D } from './src/components/supervisor/FloorPlan2D';
import { TechnicianStationView } from './src/components/technician/TechnicianStationView';
import { AdvisorInspectionView } from './src/components/advisor/AdvisorInspectionView';
import { AddVehicleModal } from './src/components/supervisor/AddVehicleModal';
import { VehicleDetailsModal } from './src/components/shared/VehicleDetailsModal';
import { UserRole } from './src/types/vehicle';

import { ThemeProvider, useTheme } from './src/context/ThemeContext';

const rolesList: UserRole[] = ['supervisor', 'tech_workshop', 'tech_alignment', 'tech_hoist', 'advisor'];

const TabTransitionWrapper: React.FC<{ activeKey: string; children: React.ReactNode }> = ({ activeKey, children }) => {
  const fadeAnim = React.useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    fadeAnim.setValue(0.3);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [activeKey]);

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          opacity: fadeAnim,
        },
        Platform.OS === 'web' && ({
          transition: 'opacity 150ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'opacity',
        } as any),
      ]}
    >
      {children}
    </Animated.View>
  );
};

const AppContent: React.FC = () => {
  const { userProfile } = useAuth();
  const { currentRole, setCurrentRole, isAddModalOpen, setIsAddModalOpen } = useVehicles();
  const { colors, isDark } = useTheme();
  const [touchStart, setTouchStart] = React.useState<{ x: number; y: number } | null>(null);

  // Automatically direct user to their corresponding role page on login
  useEffect(() => {
    if (userProfile?.role) {
      setCurrentRole(userProfile.role);
    }
  }, [userProfile?.role]);

  const currentIndex = rolesList.indexOf(currentRole);

  const handleTouchStart = (e: any) => {
    const touch = e.nativeEvent.touches ? e.nativeEvent.touches[0] : e.nativeEvent;
    if (touch) {
      setTouchStart({ x: touch.pageX, y: touch.pageY });
    }
  };

  const handleTouchEnd = (e: any) => {
    if (!touchStart) return;
    const touch = e.nativeEvent.changedTouches ? e.nativeEvent.changedTouches[0] : e.nativeEvent;
    if (!touch) return;

    const dx = touch.pageX - touchStart.x;
    const dy = touch.pageY - touchStart.y;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0) {
        if (currentIndex < rolesList.length - 1) {
          setCurrentRole(rolesList[currentIndex + 1]);
        }
      } else {
        if (currentIndex > 0) {
          setCurrentRole(rolesList[currentIndex - 1]);
        }
      }
    }
    setTouchStart(null);
  };

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'hide-scrollbar-style';
      let style = document.getElementById(styleId);
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          ::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          * {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
        `;
        document.head.appendChild(style);
      }
      return () => {
        if (style && style.parentNode) {
          style.parentNode.removeChild(style);
        }
      };
    }
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.surface} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header />
        <SegmentedTabs />
        <SearchBarRow />
        <View
          style={styles.mainContent}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <TabTransitionWrapper activeKey={currentRole}>
            {currentRole === 'supervisor' && <FloorPlan2D />}
            {(currentRole === 'tech_workshop' || currentRole === 'tech_hoist' || currentRole === 'tech_alignment') && (
              <TechnicianStationView />
            )}
            {currentRole === 'advisor' && <AdvisorInspectionView />}
          </TabTransitionWrapper>
        </View>
        <AddVehicleModal />
        <VehicleDetailsModal />
      </View>
    </SafeAreaView>
  );
};

const AuthGate: React.FC = () => {
  const { isAuthenticated, isAuthLoading } = useAuth();
  const { colors } = useTheme();

  if (isAuthLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <VehicleProvider>
      <AppContent />
    </VehicleProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AuthGate />
      </ThemeProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
});
