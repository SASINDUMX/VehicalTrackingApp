import { Platform } from 'react-native';

class HapticFeedbackService {
  private isMuted: boolean = false;

  constructor() {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      this.isMuted = localStorage.getItem('um_haptics_muted') === 'true';
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem('um_haptics_muted', muted ? 'true' : 'false');
    }
  }

  public getMuted(): boolean {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem('um_haptics_muted') === 'true';
    }
    return this.isMuted;
  }

  /**
   * Distinct two-pulse vibration when a vehicle arrives at the technician's bay
   */
  public triggerArrivalHaptic() {
    if (this.getMuted()) return;
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
    if (this.getMuted()) return;
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
    if (this.getMuted()) return;
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
