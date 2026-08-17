import { Platform } from 'react-native';

class HapticFeedbackService {
  /**
   * Distinct two-pulse vibration when a vehicle arrives at the technician's bay
   */
  public triggerArrivalHaptic() {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([70, 50, 120]);
      }
    } catch {
      // Graceful fallback for unsupported browsers
    }
  }

  /**
   * Subtle single-pulse vibration for task checkboxes and button taps
   */
  public triggerLightHaptic() {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(35);
      }
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Success vibration pattern for vehicle handover and job completion
   */
  public triggerSuccessHaptic() {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([60, 40, 60, 40, 100]);
      }
    } catch {
      // Graceful fallback
    }
  }
}

export const hapticService = new HapticFeedbackService();
