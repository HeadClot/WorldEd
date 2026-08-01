import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TransformMode } from '@/types/transform_mode.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import {
  transformModalNumericRotationRadians,
  transformModalNumericScaleFactor,
  transformModalNumericTranslationDelta,
  transformModalNumericUsesDegrees,
} from '@/transform/modal/transform_modal_numeric_delta.js';

describe('transformModalNumericTranslationDelta', () => {
  it('builds a world delta along the locked axis for the typed distance', () => {
    const orientation = new THREE.Quaternion();
    const delta = transformModalNumericTranslationDelta(0.25, TransformModalAxis.X, orientation);
    expect(delta).not.toBeNull();
    expect(delta!.x).toBeCloseTo(0.25, 6);
    expect(delta!.y).toBeCloseTo(0, 6);
    expect(delta!.z).toBeCloseTo(0, 6);
  });

  it('returns null when no axis is locked', () => {
    const orientation = new THREE.Quaternion();
    expect(transformModalNumericTranslationDelta(1, TransformModalAxis.None, orientation)).toBeNull();
  });
});

describe('transformModalNumericRotationRadians', () => {
  it('converts typed degrees to radians', () => {
    expect(transformModalNumericRotationRadians(180)).toBeCloseTo(Math.PI, 6);
    expect(transformModalNumericRotationRadians(90)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('transformModalNumericScaleFactor', () => {
  it('clamps absolute typed factors to a positive minimum', () => {
    expect(transformModalNumericScaleFactor(2)).toBe(2);
    expect(transformModalNumericScaleFactor(-0.5)).toBe(0.5);
    expect(transformModalNumericScaleFactor(0)).toBe(0.01);
  });
});

describe('transformModalNumericUsesDegrees', () => {
  it('is true only for rotate mode', () => {
    expect(transformModalNumericUsesDegrees(TransformMode.ROTATE)).toBe(true);
    expect(transformModalNumericUsesDegrees(TransformMode.TRANSLATE)).toBe(false);
    expect(transformModalNumericUsesDegrees(TransformMode.SCALE)).toBe(false);
  });
});
