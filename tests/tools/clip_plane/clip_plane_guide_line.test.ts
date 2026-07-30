import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildExtendedClipGuideLine } from '@/tools/clip_plane/clip_plane_guide_line.js';

describe('buildExtendedClipGuideLine', () => {
  it('should return null with fewer than two points', () => {
    expect(buildExtendedClipGuideLine([])).toBeNull();
    expect(buildExtendedClipGuideLine([new THREE.Vector3(0, 0, 0)])).toBeNull();
  });

  it('should return null for coincident points', () => {
    const point = new THREE.Vector3(1, 2, 3);
    expect(buildExtendedClipGuideLine([point, point.clone()])).toBeNull();
  });

  it('should extend past both placement points along their axis', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    const guide = buildExtendedClipGuideLine([a, b], 3, 1.5);
    expect(guide).not.toBeNull();
    expect(guide!.start.x).toBeLessThan(a.x);
    expect(guide!.end.x).toBeGreaterThan(b.x);
    expect(guide!.start.y).toBeCloseTo(0);
    expect(guide!.end.y).toBeCloseTo(0);
  });

  it('should keep the guide collinear with the placement segment', () => {
    const a = new THREE.Vector3(-1, 2, 4);
    const b = new THREE.Vector3(3, 2, 4);
    const guide = buildExtendedClipGuideLine([a, b]);
    expect(guide).not.toBeNull();
    const edge = b.clone().sub(a).normalize();
    const guideDir = guide!.end.clone().sub(guide!.start).normalize();
    expect(Math.abs(guideDir.dot(edge))).toBeCloseTo(1);
  });
});
