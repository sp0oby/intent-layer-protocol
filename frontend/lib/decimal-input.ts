/**
 * Decimal-input sanitiser for the swap form's amount field. Drops
 * everything that isn't a digit or the decimal separator and collapses
 * multiple dots to one (so paste from a formatted source can't break
 * the input).
 */
export function sanitizeDecimal(input: string): string {
  // Allow at most one dot. Strip everything else.
  const cleaned = input.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot < 0) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}
