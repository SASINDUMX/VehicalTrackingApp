/**
 * Sri Lanka Vehicle Registration Number Formatting & Validation
 * 
 * Rules:
 * 1. Numeric Prefix (Vintage/Provincial):
 *    - Starts with 2 numbers, followed by '-', followed by exactly 4 numbers.
 *    - Example: 14-1234, 64-9842
 *    - Auto-formats '-' after 2 digits.
 * 
 * 2. Alphabet Prefix (Modern):
 *    - Starts with 2 or 3 English letters (e.g. WP, CAB, GA), followed by '-', followed by exactly 4 numbers.
 *    - Example: CAB-1234, WP-5678, GA-9012
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

  // Strip all invalid characters
  const clean = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!clean) return '';

  const startsWithDigit = /^\d/.test(clean);

  if (startsWithDigit) {
    // Digits only: ##-####
    const digitsOnly = clean.replace(/\D/g, '').slice(0, 6);
    if (digitsOnly.length <= 2) {
      if (digitsOnly.length === 2 && raw.length > prev.length) {
        return `${digitsOnly}-`;
      }
      return digitsOnly;
    }
    const prefix = digitsOnly.slice(0, 2);
    const suffix = digitsOnly.slice(2, 6);
    return `${prefix}-${suffix}`;
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
  const trimmed = no.trim().toUpperCase();

  // Pattern 1: 2 digits - 4 digits (e.g. 14-1234)
  const isNumericFormat = /^\d{2}-\d{4}$/.test(trimmed);

  // Pattern 2: 2 or 3 letters - 4 digits (e.g. WP-1234, CAB-1234)
  const isLetterFormat = /^[A-Z]{2,3}-\d{4}$/.test(trimmed);

  return isNumericFormat || isLetterFormat;
};
