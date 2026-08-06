import { describe, it, expect } from 'vitest';
import { SNAP_PRESETS, cycleSnapInterval } from '@/types/snap_presets.js';

describe('SNAP_PRESETS', () => {
  it('should list ascending power-of-two snap intervals from 1/32 through 64', () => {
    const expected = [0.03125, 0.0625, 0.125, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0];
    expect(SNAP_PRESETS).toEqual(expected);
  });
});

describe('cycleSnapInterval', () => {
  it('should advance one step forward and backward through the preset list', () => {
    expect(cycleSnapInterval(1.0, 1)).toBe(2.0);
    expect(cycleSnapInterval(1.0, -1)).toBe(0.5);
  });

  it('should wrap past the ends of the preset list', () => {
    expect(cycleSnapInterval(64.0, 1)).toBe(0.03125);
    expect(cycleSnapInterval(0.03125, -1)).toBe(64.0);
  });

  it('should skip multiple presets in either direction', () => {
    expect(cycleSnapInterval(1.0, 3)).toBe(8.0);
    expect(cycleSnapInterval(1.0, -3)).toBe(0.125);
  });

  it('should wrap large steps and full-list steps back to a valid preset', () => {
    expect(SNAP_PRESETS).toContain(cycleSnapInterval(1.0, 20));
    expect(SNAP_PRESETS).toContain(cycleSnapInterval(1.0, -20));
    expect(cycleSnapInterval(1.0, SNAP_PRESETS.length)).toBe(1.0);
  });

  it('should treat an unknown value as index 0', () => {
    expect(cycleSnapInterval(99.0, 1)).toBe(SNAP_PRESETS[1]);
  });
});
