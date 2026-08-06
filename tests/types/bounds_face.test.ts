import { describe, it, expect } from 'vitest';
import { BOUNDS_FACE_USERDATA_KEY } from '@/types/bounds_face.js';

describe('BoundsFace enum', () => {
  it('should expose a stable userdata key', () => {
    expect(BOUNDS_FACE_USERDATA_KEY).toBe('boundsFace');
  });
});
