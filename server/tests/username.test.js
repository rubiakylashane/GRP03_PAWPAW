import { describe, expect, it } from 'vitest';
import { normalizeUsername } from '../utils/username.js';

describe('normalizeUsername', () => {
  it('trims whitespace and normalizes a valid username to lowercase', () => {
    expect(normalizeUsername('  Clinic_Staff9  ')).toBe('clinic_staff9');
  });

  it('accepts the minimum and maximum supported username lengths', () => {
    expect(normalizeUsername('a123')).toBe('a123');
    expect(normalizeUsername('a'.repeat(20))).toBe('a'.repeat(20));
  });

  it.each(['abc', 'a'.repeat(21), 'name with space', 'name@example.com', 'name-1'])(
    'rejects invalid username %s',
    (username) => {
      expect(normalizeUsername(username)).toBeNull();
    }
  );
});
