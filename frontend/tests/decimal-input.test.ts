import {describe, expect, it} from 'vitest';
import {sanitizeDecimal} from '@/lib/decimal-input';

describe('sanitizeDecimal', () => {
  it('passes through plain digits', () => {
    expect(sanitizeDecimal('1234')).toBe('1234');
  });

  it('keeps a single decimal point', () => {
    expect(sanitizeDecimal('1.5')).toBe('1.5');
    expect(sanitizeDecimal('.5')).toBe('.5');
    expect(sanitizeDecimal('100.001')).toBe('100.001');
  });

  it('strips letters, commas, and whitespace', () => {
    expect(sanitizeDecimal(' 1, 234.5 abc')).toBe('1234.5');
  });

  it('collapses multiple dots — keeps the first, drops the rest', () => {
    expect(sanitizeDecimal('1.2.3')).toBe('1.23');
    expect(sanitizeDecimal('..')).toBe('.');
    expect(sanitizeDecimal('1.2.3.4.5')).toBe('1.2345');
  });

  it('returns empty string for input with no usable characters', () => {
    expect(sanitizeDecimal('abc!@#')).toBe('');
    expect(sanitizeDecimal('')).toBe('');
  });

  it('preserves trailing dot (user is mid-typing a decimal)', () => {
    expect(sanitizeDecimal('1.')).toBe('1.');
  });
});
