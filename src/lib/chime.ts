import { Platform } from 'react-native';

class AudioChimeService {
  private isMuted: boolean = false;

  constructor() {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      this.isMuted = localStorage.getItem('um_chime_muted') === 'true';
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem('um_chime_muted', muted ? 'true' : 'false');
    }
  }

  public getMuted(): boolean {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem('um_chime_muted') === 'true';
    }
    return this.isMuted;
  }

  public playChime() {
    this.playArrivalChime();
  }

  public playArrivalChime() {
    if (this.getMuted()) return;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        const ctx = new AudioContextClass();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';

        // High-tech two-tone arrival chime (659.25Hz E5 -> 880.00Hz A5)
        osc1.frequency.setValueAtTime(659.25, now);
        osc2.frequency.setValueAtTime(880.00, now + 0.12);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.12);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.5);
      } catch (err) {
        console.warn('Audio chime playback error:', err);
      }
    }
  }
}

export const chimeService = new AudioChimeService();
