import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { BoundsGuideLines } from '../../../src/transform/bounds/bounds_guide_lines.js';
import { Theme } from '../../../src/theme.js';
import { GizmoVisualStyle } from '../../../src/transform/gizmo/gizmo_visual_style.js';

describe('BoundsGuideLines', () => {
  let guides: BoundsGuideLines;

  beforeEach(() => {
    guides = new BoundsGuideLines(Theme, 4);
  });

  it('should start hidden', () => {
    expect(guides.isVisible()).toBe(false);
  });

  it('should toggle visibility', () => {
    guides.setVisible(true);
    expect(guides.isVisible()).toBe(true);
    guides.setVisible(false);
    expect(guides.isVisible()).toBe(false);
  });

  it('should create 24 corner axis rays for a box without filter context', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(1, 2, 3));
    expect(guides.getSegmentCount()).toBe(24);
  });

  it('should omit the orthographic depth axis when a view plane is provided', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(1, 1, 1), { viewPlane: 'xz' });
    // 8 corners × 2 axes (X and Z) = 16 segments
    expect(guides.getSegmentCount()).toBe(16);
  });

  it('should keep only ground-reaching rays when filtering an empty scene in 3D', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(0.5, 0.5, 0.5), {
      viewPlane: 'xyz',
      boundsCenter: new THREE.Vector3(0, 2, 0),
      boundsQuaternion: new THREE.Quaternion(),
      raycastMeshes: [],
    });
    // Only downward (-Y) rays from the four bottom corners can hit Y=0 within length 4.
    expect(guides.getSegmentCount()).toBe(4);
  });

  it('should clip ground-only rays to the ground plane distance', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(0.5, 0.5, 0.5), {
      viewPlane: 'xyz',
      boundsCenter: new THREE.Vector3(0, 2, 0),
      boundsQuaternion: new THREE.Quaternion(),
      raycastMeshes: [],
    });
    const position = guides.getGeometry().getAttribute('position') as THREE.BufferAttribute;
    // Bottom corner local (0.5,-0.5,0.5) -> world (0.5,1.5,0.5); -Y hits ground at distance 1.5.
    let foundClippedDown = false;
    for (let index = 0; index < position.count; index += 2) {
      const start = new THREE.Vector3().fromBufferAttribute(position, index);
      const end = new THREE.Vector3().fromBufferAttribute(position, index + 1);
      if (Math.abs(start.y + 0.5) > 1e-5) continue;
      if (Math.abs(end.x - start.x) > 1e-5 || Math.abs(end.z - start.z) > 1e-5) continue;
      expect(start.distanceTo(end)).toBeCloseTo(1.5, 4);
      foundClippedDown = true;
    }
    expect(foundClippedDown).toBe(true);
  });

  it('should keep guide ray length fixed regardless of bounds size without filter context', () => {
    const fixedLength = 4;
    guides = new BoundsGuideLines(Theme, fixedLength);
    guides.updateFromHalfExtents(new THREE.Vector3(50, 1, 1));
    const position = guides.getGeometry().getAttribute('position');
    const start = new THREE.Vector3().fromBufferAttribute(position as THREE.BufferAttribute, 0);
    const end = new THREE.Vector3().fromBufferAttribute(position as THREE.BufferAttribute, 1);
    expect(start.distanceTo(end)).toBeCloseTo(fixedLength, 5);
  });

  it('should place solid vertices at box corners', () => {
    const half = new THREE.Vector3(1, 2, 3);
    guides.updateFromHalfExtents(half);
    const position = guides.getGeometry().getAttribute('position');
    const corner = new THREE.Vector3(1, 2, 3);
    let foundCorner = false;
    for (let i = 0; i < position.count; i += 2) {
      const start = new THREE.Vector3().fromBufferAttribute(position as THREE.BufferAttribute, i);
      if (start.distanceTo(corner) < 1e-6) {
        foundCorner = true;
        break;
      }
    }
    expect(foundCorner).toBe(true);
  });

  it('should fade tip colors darker than solid starts', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(1, 1, 1));
    const color = guides.getGeometry().getAttribute('color');
    const startLuma = color.getX(0) + color.getY(0) + color.getZ(0);
    const tipLuma = color.getX(1) + color.getY(1) + color.getZ(1);
    expect(tipLuma).toBeLessThan(startLuma);
  });

  it('should expose a group containing front and occluded line passes', () => {
    const root = guides.getObject();
    expect(root).toBeInstanceOf(THREE.Group);
    expect(root.userData['isBoundsGuideLines']).toBe(true);
    const linePasses = root.children.filter((child) => child instanceof THREE.LineSegments);
    expect(linePasses).toHaveLength(2);
  });

  it('should use depth-aware front and occluded materials like move gizmos', () => {
    const linePasses = guides
      .getObject()
      .children.filter((child) => child instanceof THREE.LineSegments) as THREE.LineSegments[];
    const materials = linePasses.map((line) => line.material as THREE.LineBasicMaterial);
    const front = materials.find((material) => material.depthFunc === THREE.LessEqualDepth);
    const occluded = materials.find((material) => material.depthFunc === THREE.GreaterDepth);
    expect(front).toBeDefined();
    expect(occluded).toBeDefined();
    expect(front!.depthTest).toBe(true);
    expect(occluded!.depthTest).toBe(true);
    expect(front!.opacity).toBe(GizmoVisualStyle.frontOpacity);
    expect(occluded!.opacity).toBe(GizmoVisualStyle.occludedOpacity);
  });

  it('should share one geometry between front and occluded passes', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(1, 1, 1));
    const linePasses = guides
      .getObject()
      .children.filter((child) => child instanceof THREE.LineSegments) as THREE.LineSegments[];
    expect(linePasses[0]!.geometry).toBe(linePasses[1]!.geometry);
    expect(linePasses[0]!.geometry).toBe(guides.getGeometry());
  });

  it('should mark the occluded pass as a gizmo ghost', () => {
    const occluded = guides.getObject().children.find((child) => child.userData['isGizmoOccludedGhost'] === true);
    expect(occluded).toBeInstanceOf(THREE.LineSegments);
  });

  it('should dispose without throwing', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(1, 1, 1));
    expect(() => guides.dispose()).not.toThrow();
  });
});
