import { describe, expect, it } from 'vitest';
import { formatName } from './index';

describe('formatName', () => {
  it('returns "Unknown" for empty string', () => {
    expect(formatName('')).toBe('Unknown');
  });

  it('returns "Unknown" for whitespace-only input', () => {
    expect(formatName('   ')).toBe('Unknown');
    expect(formatName('\t\n')).toBe('Unknown');
  });

  it('formats single word lowercase correctly', () => {
    expect(formatName('john')).toBe('John');
  });

  it('formats single word uppercase correctly', () => {
    expect(formatName('JOHN')).toBe('John');
  });

  it('handles multiple words with mixed case and extra spaces', () => {
    expect(formatName('  john   doe  ')).toBe('John Doe');
  });

  it('handles multiple words with multiple spaces', () => {
    expect(formatName('jane   smith   doe')).toBe('Jane Smith Doe');
  });

  it('handles null input', () => {
    expect(formatName(null)).toBe('Unknown');
  });

  it('handles undefined input', () => {
    expect(formatName(undefined)).toBe('Unknown');
  });

  it('handles number input by converting to string', () => {
    expect(formatName(123)).toBe('123');
  });

  it('handles object input by converting to string', () => {
    expect(formatName({})).toBe('[object Object]');
  });

  it('handles hyphens within words', () => {
    expect(formatName('mary-jane')).toBe('Mary-Jane');
    expect(formatName('anne-marie')).toBe('Anne-Marie');
  });

  it('handles apostrophes within words', () => {
    expect(formatName("o'reilly")).toBe("O'Reilly");
    expect(formatName("d'angelo")).toBe("D'Angelo");
  });

  it('handles non-English characters', () => {
    expect(formatName('josé García')).toBe('José García');
    expect(formatName('maría josé')).toBe('María José');
  });

  it('handles mixed case with numbers', () => {
    expect(formatName('john doe 123')).toBe('John Doe 123');
  });

  it('handles single word with leading/trailing spaces', () => {
    expect(formatName('  alice  ')).toBe('Alice');
  });

  it('handles multiple hyphens and apostrophes', () => {
    expect(formatName("o'neil-johnson-smith")).toBe("O'Neil-Johnson-Smith");
  });
});