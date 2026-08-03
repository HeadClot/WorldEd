import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  sourcePointToEditorMeters,
  swizzleSourceComponentsToThree,
  swizzleSourceDirectionToThree,
  swizzleSourceToThree,
  VMF_INCHES_TO_METERS,
} from '@/io/vmf/vmf_coordinates.js';

/** Source Z-up right-handed → editor Y-up right-handed must not mirror on Z. */
describe('VMF coordinate swizzle', () => {
  it('maps Source +Y to editor -Z so handedness is preserved', () => {
    const three = swizzleSourceToThree({ x: 0, y: 1, z: 0 });
    expect(three.x).toBeCloseTo(0, 8);
    expect(three.y).toBeCloseTo(0, 8);
    expect(three.z).toBeCloseTo(-1, 8);
  });

  it('maps Source +Z up to editor +Y up', () => {
    const three = swizzleSourceToThree({ x: 0, y: 0, z: 1 });
    expect(three.x).toBeCloseTo(0, 8);
    expect(three.y).toBeCloseTo(1, 8);
    expect(three.z).toBeCloseTo(0, 8);
  });

  it('keeps a right-handed basis after swizzle (determinant +1)', () => {
    const ex = swizzleSourceComponentsToThree(1, 0, 0);
    const ey = swizzleSourceComponentsToThree(0, 1, 0);
    const ez = swizzleSourceComponentsToThree(0, 0, 1);
    const scalarTriple = ex.dot(new THREE.Vector3().crossVectors(ey, ez));
    expect(scalarTriple).toBeCloseTo(1, 8);
  });

  it('scales Source points into editor meters with the same axis mapping', () => {
    const meters = sourcePointToEditorMeters({ x: 32, y: 64, z: 96 });
    expect(meters.x).toBeCloseTo(32 * VMF_INCHES_TO_METERS, 8);
    expect(meters.y).toBeCloseTo(96 * VMF_INCHES_TO_METERS, 8);
    expect(meters.z).toBeCloseTo(-64 * VMF_INCHES_TO_METERS, 8);
  });

  it('swizzles directions with the same components as points', () => {
    const direction = swizzleSourceDirectionToThree({ x: 0, y: 2, z: 0 });
    expect(direction.z).toBeCloseTo(-2, 8);
  });
});
