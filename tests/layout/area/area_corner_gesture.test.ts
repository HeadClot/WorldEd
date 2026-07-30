import { describe, expect, it } from 'vitest';
import { resolveBlenderJoinIds } from '@/layout/area/area_corner_gesture.js';

describe('resolveBlenderJoinIds', () => {
  it('keeps the drag source and closes the neighbor under the pointer', () => {
    const join = resolveBlenderJoinIds('front', 'perspective');
    expect(join.survivorId).toBe('front');
    expect(join.removeId).toBe('perspective');
  });

  it('does not invert when dragging the other direction', () => {
    const join = resolveBlenderJoinIds('perspective', 'front');
    expect(join.survivorId).toBe('perspective');
    expect(join.removeId).toBe('front');
  });
});
