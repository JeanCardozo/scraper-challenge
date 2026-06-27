/**
 * 7.6 Backoff jitter test.
 *
 * Verifies that the exponential backoff calculation produces delays
 * within the ±50% jitter range from the configured base.
 *
 * Tests use a 100ms base to match the spec, checking that:
 * - All values are ≥ 1ms
 * - Values fall within expected range for each attempt
 */

import { describe, it, expect } from 'vitest';
import { calculateBackoff } from '../pdf/downloader.js';

describe('Backoff jitter', () => {
  it('produces values in expected range for attempt 0 (base 100ms)', () => {
    // attempt 0: base * 2^0 = 100ms, jitter 0.5–1.5 → 50–150
    for (let i = 0; i < 100; i++) {
      const delay = calculateBackoff(100, 0);
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(150);
    }
  });

  it('produces values in expected range for attempt 1 (base 100ms)', () => {
    // attempt 1: base * 2^1 = 200ms, jitter 0.5–1.5 → 100–300
    for (let i = 0; i < 100; i++) {
      const delay = calculateBackoff(100, 1);
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(300);
    }
  });

  it('produces values in expected range for attempt 2 (base 100ms)', () => {
    // attempt 2: base * 2^2 = 400ms, jitter 0.5–1.5 → 200–600
    for (let i = 0; i < 100; i++) {
      const delay = calculateBackoff(100, 2);
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeGreaterThanOrEqual(200);
      expect(delay).toBeLessThanOrEqual(600);
    }
  });

  it('never returns 0ms', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      for (let i = 0; i < 50; i++) {
        const delay = calculateBackoff(1, attempt);
        expect(delay).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('scales with different base values', () => {
    const delay1 = calculateBackoff(1000, 0);
    expect(delay1).toBeGreaterThanOrEqual(500);
    expect(delay1).toBeLessThanOrEqual(1500);
  });
});
