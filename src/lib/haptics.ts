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
   * Strong, punchy vibration pattern when a vehicle arrives at the technician's bay
   */
  public triggerArrivalHaptic() {
    if (this.getMuted()) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 450]);
      }
    } catch {
      // Graceful fallback for unsupported browsers
    }
  }

  /**
   * Firm, solid physical click vibration for task checkboxes and button taps
   */
  public triggerLightHaptic() {
    if (this.getMuted()) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(80);
      }
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Powerful celebratory vibration pattern for vehicle handover and job completion
   */
  public triggerSuccessHaptic() {
    if (this.getMuted()) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([150, 80, 150, 80, 300, 100, 500]);
      }
    } catch {
      // Graceful fallback
    }
  }
}

export const hapticService = new HapticFeedbackService();
