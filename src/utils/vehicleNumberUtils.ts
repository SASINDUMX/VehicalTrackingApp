/**
 * Sri Lanka Vehicle Registration Number Formatting & Validation
 * 
 * Rules:
 * 1. Numeric Prefix (Vintage / Classic / 300-series):
 *    - Starts with 2 or 3 numbers (e.g. 14, 19, 64, 250, 300, 301, 302), followed by '-', followed by exactly 4 numbers.
 *    - Examples: 14-1234, 64-9842, 300-4234, 301-5678, 250-9876
 *    - Auto-formats '-' after 3 digits or when typed after 2 digits.
 * 
 * 2. Alphabet Prefix (Modern):
 *    - Starts with 2 or 3 English letters (e.g. WP, CAB, GA), followed by '-', followed by exactly 4 numbers.
 *    - Examples: CAB-1234, WP-5678, GA-9012
 *    - Auto-formats '-' after 3 letters or when a number is entered after 2 letters.
 */

export const formatVehicleNoInput = (raw: string, prev: string = ''): string => {
  // If user is deleting (backspacing)
  if (raw.length < prev.length) {
    if (prev.endsWith('-') && !raw.endsWith('-')) {
      return raw.slice(0, -1);
    }
    return raw;
  }

  // Convert space(s) to hyphen so typing space on keypad acts as typing hyphen seamlessly
  const withHyphen = raw.replace(/\s+/g, '-').replace(/-+/g, '-');

  // Strip all invalid characters
  const clean = withHyphen.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!clean) return '';

  const startsWithDigit = /^\d/.test(clean);

  if (startsWithDigit) {
    // If user typed or pasted a hyphen
    if (clean.includes('-')) {
      const parts = clean.split('-');
      const prefix = parts[0].replace(/\D/g, '').slice(0, 3);
      const suffix = parts.slice(1).join('').replace(/\D/g, '').slice(0, 4);
      if (clean.endsWith('-') && suffix.length === 0) {
        return `${prefix}-`;
      }
      return suffix.length > 0 ? `${prefix}-${suffix}` : prefix;
    }

    const digitsOnly = clean.replace(/\D/g, '').slice(0, 7);

    // 7 digits (e.g. 3004234) -> 300-4234
    if (digitsOnly.length === 7) {
      return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`;
    }

    // 6 digits without hyphen (e.g. 141234) -> 14-1234
    if (digitsOnly.length === 6) {
      return `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`;
    }

    // While typing: auto-insert '-' after 3 digits (e.g. 300 -> 300-)
    if (digitsOnly.length === 3 && raw.length > prev.length) {
      return `${digitsOnly}-`;
    }

    if (digitsOnly.length > 3) {
      return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`;
    }

    return digitsOnly;
  } else {
    // Letters prefix: AA-#### or AAA-####
    const parts = clean.split('-');
    const letterPart = parts[0].replace(/[^A-Z]/g, '').slice(0, 3);
    const remaining = clean.slice(letterPart.length).replace(/-/g, '');
    const numberPart = remaining.replace(/\D/g, '').slice(0, 4);

    // Auto-append '-' when 3 letters are typed and no numbers yet
    if (letterPart.length === 3 && numberPart.length === 0 && !clean.includes('-')) {
      return `${letterPart}-`;
    }

    // When 2 or 3 letters are followed by hyphen or numbers
    if (letterPart.length >= 2 && (clean.includes('-') || numberPart.length > 0)) {
      return `${letterPart}-${numberPart}`;
    }

    return letterPart;
  }
};

export const isValidVehicleNo = (no: string): boolean => {
  if (!no) return false;
  const trimmed = no.trim().toUpperCase().replace(/\s+/g, '-');

  // Pattern 1: 2 or 3 digits - 4 digits (e.g. 14-1234, 300-4234, 301-1234)
  const isNumericFormat = /^\d{2,3}-\d{4}$/.test(trimmed);

  // Pattern 2: 2 or 3 letters - 4 digits (e.g. WP-1234, CAB-1234)
  const isLetterFormat = /^[A-Z]{2,3}-\d{4}$/.test(trimmed);

  return isNumericFormat || isLetterFormat;
};
