import { describe, it, expect } from 'vitest';
import { Theme } from '@/theme.js';

describe('Theme', () => {
  it('should freeze theme tokens against mutation', () => {
    expect(Object.isFrozen(Theme)).toBe(true);
    expect(() => {
      (Theme as { selectionColor: number }).selectionColor = 0x000000;
    }).toThrow();
  });

  it('should expose the orange selection accent used by the editor', () => {
    expect(Theme.selectionColor).toBe(0xe86a17);
  });

  it('should expose distinct clip point and keep/discard preview colors', () => {
    expect(Theme.clipPoint1Color).not.toBe(Theme.clipPoint2Color);
    expect(Theme.clipPoint2Color).not.toBe(Theme.clipPoint3Color);
    expect(Theme.clipKeepColor).not.toBe(Theme.clipDiscardColor);
    expect(Theme.clipMarkerColor).not.toBe(Theme.selectionColor);
  });
});
