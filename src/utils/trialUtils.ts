export interface TrialInfo {
  isTrial: boolean;
  expiresAt: string | null;
  daysRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean; // <= 3 days left
}

export interface MinimalBranchTrialRecord {
  id: string;
  name?: string;
  code?: string;
  is_trial?: boolean;
  trial_expires_at?: string | null;
}

export interface MinimalProfileTrialRecord {
  is_trial?: boolean;
  trial_expires_at?: string | null;
}

/**
 * Calculates current trial evaluation status for a given branch and user profile.
 * - If neither branch nor profile is marked as trial, returns isTrial = false (permanent license).
 * - Branch-level trial configuration takes precedence over individual profile trial.
 */
export function calculateTrialInfo(
  branch?: MinimalBranchTrialRecord | null,
  profile?: MinimalProfileTrialRecord | null
): TrialInfo {
  const isBranchTrial = Boolean(branch?.is_trial);
  const isProfileTrial = Boolean(profile?.is_trial);

  if (!isBranchTrial && !isProfileTrial) {
    return {
      isTrial: false,
      expiresAt: null,
      daysRemaining: Infinity,
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  // Branch trial expiration takes precedence; falls back to profile trial expiration
  const rawExpiresAt = (isBranchTrial ? branch?.trial_expires_at : profile?.trial_expires_at) || null;

  if (!rawExpiresAt) {
    // Flagged as trial without a date constraint — default active 14-day evaluation
    return {
      isTrial: true,
      expiresAt: null,
      daysRemaining: 14,
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const expiresTime = new Date(rawExpiresAt).getTime();
  if (Number.isNaN(expiresTime)) {
    return {
      isTrial: true,
      expiresAt: null,
      daysRemaining: 14,
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const now = Date.now();
  const diffMs = expiresTime - now;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const isExpired = diffMs <= 0;
  const isExpiringSoon = !isExpired && daysRemaining <= 3;

  return {
    isTrial: true,
    expiresAt: rawExpiresAt,
    daysRemaining,
    isExpired,
    isExpiringSoon,
  };
}

export function formatTrialDaysText(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Trial Expired';
  if (daysRemaining === 1) return '1 day remaining';
  return `${daysRemaining} days remaining`;
}
