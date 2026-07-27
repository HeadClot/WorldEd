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

  it('should create 24 corner axis rays for a box', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(1, 2, 3));
    expect(guides.getSegmentCount()).toBe(24);
  });

  it('should keep guide ray length fixed regardless of bounds size', () => {
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

  it('should fade the tip color relative to the solid corner color', () => {
    guides.updateFromHalfExtents(new THREE.Vector3(1, 1, 1));
    const color = guides.getGeometry().getAttribute('color') as THREE.BufferAttribute;
    const solid = new THREE.Vector3(color.getX(0), color.getY(0), color.getZ(0));
    const tip = new THREE.Vector3(color.getX(1), color.getY(1), color.getZ(1));
    expect(tip.length()).toBeLessThan(solid.length());
    expect(tip.x / solid.x).toBeCloseTo(0.35, 5);
  });

  it('should expose a group containing front and occluded line passes', () => {
    const root = guides.getObject();
    expect(root).toBeInstanceOf(THREE.Group);
    expect(root.userData['isBoundsGuideLines']).toBe(true);
    const linePasses = root.children.filter((child) => child instanceof THREE.LineSegments);
    expect(linePasses).toHaveLength(2);
  });

  it('should use depth-aware front and occluded screen-pixel dash shaders', () => {
    const linePasses = guides
      .getObject()
      .children.filter((child) => child instanceof THREE.LineSegments) as THREE.LineSegments[];
    const materials = linePasses.map((line) => line.material as THREE.ShaderMaterial);
    const front = materials.find((material) => material.depthFunc === THREE.LessEqualDepth);
    const occluded = materials.find((material) => material.depthFunc === THREE.GreaterDepth);
    expect(front).toBeDefined();
    expect(occluded).toBeDefined();
    expect(front).toBeInstanceOf(THREE.ShaderMaterial);
    expect(occluded).toBeInstanceOf(THREE.ShaderMaterial);
    expect(front!.depthTest).toBe(true);
    expect(occluded!.depthTest).toBe(true);
    expect(front!.uniforms['opacity']!.value).toBe(GizmoVisualStyle.frontOpacity);
    expect(occluded!.uniforms['opacity']!.value).toBe(GizmoVisualStyle.occludedOpacity);
    expect(front!.fragmentShader).toContain('gl_FragCoord');
    expect(front!.fragmentShader).toContain('distAlong');
    expect(front!.fragmentShader).toContain('discard');
  });

  it('should author identical lineStart/lineEnd on both vertices of each segment', () => {
    guides = new BoundsGuideLines(Theme, 4);
    guides.updateFromHalfExtents(new THREE.Vector3(1, 1, 1));
    expect(guides.getSegmentCount()).toBe(24);
    const geometry = guides.getGeometry();
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const lineStart = geometry.getAttribute('lineStart') as THREE.BufferAttribute;
    const lineEnd = geometry.getAttribute('lineEnd') as THREE.BufferAttribute;
    const color = geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(position.count).toBe(48);
    expect(color.count).toBe(48);
    expect(lineStart.count).toBe(position.count);
    expect(lineEnd.count).toBe(position.count);
    for (let index = 0; index < position.count; index += 2) {
      // Start/end constants match both vertices so screen ends do not warp.
      expect(lineStart.getX(index)).toBeCloseTo(lineStart.getX(index + 1), 5);
      expect(lineStart.getY(index)).toBeCloseTo(lineStart.getY(index + 1), 5);
      expect(lineStart.getZ(index)).toBeCloseTo(lineStart.getZ(index + 1), 5);
      expect(lineEnd.getX(index)).toBeCloseTo(lineEnd.getX(index + 1), 5);
      expect(lineEnd.getY(index)).toBeCloseTo(lineEnd.getY(index + 1), 5);
      expect(lineEnd.getZ(index)).toBeCloseTo(lineEnd.getZ(index + 1), 5);
      // Positions are corner then tip; start is corner, end is tip.
      expect(lineStart.getX(index)).toBeCloseTo(position.getX(index), 5);
      expect(lineEnd.getX(index)).toBeCloseTo(position.getX(index + 1), 5);
    }
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
