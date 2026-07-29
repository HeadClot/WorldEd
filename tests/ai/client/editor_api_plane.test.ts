import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildWorldClipPlane, planeArgsHelpMessage } from '../../../src/ai/client/editor_api_plane.js';

/** Unit tests for MCP plane argument parsing. */
describe('buildWorldClipPlane', () => {
  it('builds an axis-aligned plane at a world distance', () => {
    const plane = buildWorldClipPlane({ axis: 'y', distance: 2 });
    expect(plane).not.toBeNull();
    expect(plane!.normal.y).toBeCloseTo(1);
    expect(plane!.distanceToPoint(new THREE.Vector3(0, 2, 0))).toBeCloseTo(0, 5);
  });

  it('builds a plane from point and normal', () => {
    const plane = buildWorldClipPlane({
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    });
    expect(plane).not.toBeNull();
    expect(plane!.normal.z).toBeCloseTo(1);
  });

  it('returns null when plane args are incomplete', () => {
    expect(buildWorldClipPlane({})).toBeNull();
    expect(planeArgsHelpMessage().length).toBeGreaterThan(10);
  });
});
