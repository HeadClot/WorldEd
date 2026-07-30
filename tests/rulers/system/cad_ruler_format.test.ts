import { describe, it, expect } from 'vitest';
import { formatCadDistance, formatCadSignedDelta, formatCadDeltaStatus } from '@/rulers/system/cad_ruler_format.js';

describe('cad_ruler_format', () => {
  it('should format near-zero distances as zero', () => {
    expect(formatCadDistance(0)).toBe('0');
    expect(formatCadDistance(1e-9)).toBe('0');
  });

  it('should keep fine snap precision without trailing zeros', () => {
    expect(formatCadDistance(1.25)).toBe('1.25');
    expect(formatCadDistance(0.5)).toBe('0.5');
    expect(formatCadDistance(0.03125)).toBe('0.03125');
    expect(formatCadDistance(0.25)).toBe('0.25');
  });

  it('should drop trailing decimals for whole numbers', () => {
    expect(formatCadDistance(4)).toBe('4');
    expect(formatCadDistance(4.0)).toBe('4');
  });

  it('should format signed deltas with a leading sign', () => {
    expect(formatCadSignedDelta(1.5)).toBe('+1.5');
    expect(formatCadSignedDelta(-2)).toBe('-2');
    expect(formatCadSignedDelta(0)).toBe('0');
    expect(formatCadSignedDelta(-0.03125)).toBe('-0.03125');
  });

  it('should build a status line with components and total distance', () => {
    const status = formatCadDeltaStatus(3, 4, 0);
    expect(status).toContain('+3');
    expect(status).toContain('+4');
    expect(status).toContain('5');
  });
});
