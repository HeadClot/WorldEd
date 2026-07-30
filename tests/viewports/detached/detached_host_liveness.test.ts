import { describe, expect, it } from 'vitest';
import { isDetachedHostGone } from '@/viewports/detached/detached_host_liveness.js';

describe('isDetachedHostGone', () => {
  it('should report host gone when opener is null', () => {
    const popup = { opener: null } as unknown as Window;
    expect(isDetachedHostGone(popup)).toBe(true);
  });

  it('should report host gone when opener is closed', () => {
    const popup = { opener: { closed: true } } as unknown as Window;
    expect(isDetachedHostGone(popup)).toBe(true);
  });

  it('should report host alive when opener exists and is not closed', () => {
    const popup = { opener: { closed: false } } as unknown as Window;
    expect(isDetachedHostGone(popup)).toBe(false);
  });

  it('should report host gone when reading opener throws', () => {
    const popup = {
      get opener() {
        throw new Error('cross-origin');
      },
    } as unknown as Window;
    expect(isDetachedHostGone(popup)).toBe(true);
  });
});
