import { describe, it, expect } from 'vitest';
import { Theme } from '@/theme.js';
import { ViewportType } from '@/types.js';

describe('Theme', () => {
  it('should use dark colors for background values', () => {
    expect(Theme.background).toBeLessThan(0x303030);
    expect(Theme.viewportBackground).toBeLessThan(0x303030);
  });
});

describe('Viewport separators', () => {
  it('should have a separator gap greater than 1px for visibility', () => {
    expect(Theme.separatorGapPx).toBeGreaterThan(1);
  });

  it('should use a separator color darker than the viewport background', () => {
    expect(Theme.separatorColor).toBeLessThan(Theme.viewportBackground);
  });

  it('should have a separator color that is a dark value', () => {
    expect(Theme.separatorColor).toBeLessThan(0x101010);
  });
});

describe('ViewportType', () => {
  it('should have all four viewport types defined', () => {
    expect(ViewportType.TOP).toBe('top');
    expect(ViewportType.FRONT).toBe('front');
    expect(ViewportType.SIDE).toBe('side');
    expect(ViewportType.PERSPECTIVE).toBe('perspective');
  });

  it('should have exactly four viewport types', () => {
    const values = Object.values(ViewportType).filter((v) => typeof v === 'string');
    expect(values.length).toBe(4);
  });
});
