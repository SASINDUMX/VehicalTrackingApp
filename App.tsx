import React, { useEffect } from 'react';
import { StyleSheet, View, Text, SafeAreaView, StatusBar, Platform, ActivityIndicator } from 'react-native';
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

const rolesList: UserRole[] = ['supervisor', 'tech_workshop', 'tech_alignment', 'tech_hoist', 'advisor'];

const AppContent: React.FC = () => {
  const { userProfile } = useAuth();
  const { currentRole, setCurrentRole, isAddModalOpen, setIsAddModalOpen } = useVehicles();
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
    if (touch) {
      const dx = touch.pageX - touchStart.x;
      const dy = touch.pageY - touchStart.y;

      // Minimum swipe threshold (50px) and check that movement is primarily horizontal
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) {
          // Swiped Left -> Step to Next Page
          if (currentIndex < rolesList.length - 1) {
            setCurrentRole(rolesList[currentIndex + 1]);
          }
        } else {
          // Swiped Right -> Step to Previous Page
          if (currentIndex > 0) {
            setCurrentRole(rolesList[currentIndex - 1]);
          }
        }
      }
    }
    setTouchStart(null);
  };

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'hide-scrollbar-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
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
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />
      <View style={styles.container}>
        <Header />
        <SegmentedTabs />
        <SearchBarRow />
        <View
          style={styles.mainContent}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {currentRole === 'supervisor' && <FloorPlan2D />}
          {(currentRole === 'tech_workshop' || currentRole === 'tech_hoist' || currentRole === 'tech_alignment') && (
            <TechnicianStationView />
          )}
          {currentRole === 'advisor' && <AdvisorInspectionView />}
        </View>
        <AddVehicleModal />
        <VehicleDetailsModal />
      </View>
    </SafeAreaView>
  );
};

const AuthGate: React.FC = () => {
  const { isAuthenticated, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Loading...</Text>
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
      <AuthGate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b0f19',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  mainContent: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
  },
});
