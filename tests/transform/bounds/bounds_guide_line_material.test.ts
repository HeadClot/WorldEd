import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BOUNDS_GUIDE_DASH_PIXELS,
  BOUNDS_GUIDE_GAP_PIXELS,
  createBoundsGuideFrontLineMaterial,
  createBoundsGuideOccludedLineMaterial,
  isBoundsGuideDashPixelDrawn,
  measureScreenPixelDistanceAlongSegment,
} from '../../../src/transform/bounds/bounds_guide_line_material.js';
import { GizmoVisualStyle } from '../../../src/transform/gizmo/gizmo_visual_style.js';

describe('bounds_guide_line_material', () => {
  it('should create a front dashed shader with depth-tested opacity', () => {
    const material = createBoundsGuideFrontLineMaterial();
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    expect(material.transparent).toBe(true);
    expect(material.uniforms['opacity']!.value).toBeCloseTo(GizmoVisualStyle.frontOpacity);
    expect(material.uniforms['dashSize']!.value).toBeCloseTo(BOUNDS_GUIDE_DASH_PIXELS);
    expect(material.uniforms['gapSize']!.value).toBeCloseTo(BOUNDS_GUIDE_GAP_PIXELS);
    expect(material.uniforms['viewport']!.value).toBeInstanceOf(THREE.Vector4);
    material.dispose();
  });

  it('should create an occluded ghost dashed shader with lower opacity', () => {
    const front = createBoundsGuideFrontLineMaterial();
    const occluded = createBoundsGuideOccludedLineMaterial();
    expect(occluded).toBeInstanceOf(THREE.ShaderMaterial);
    expect(occluded.depthFunc).toBe(THREE.GreaterDepth);
    expect(occluded.uniforms['opacity']!.value).toBeCloseTo(GizmoVisualStyle.occludedOpacity);
    expect(occluded.uniforms['opacity']!.value).toBeLessThan(front.uniforms['opacity']!.value);
    front.dispose();
    occluded.dispose();
  });

  it('should measure dashes from gl_FragCoord along constant screen endpoints', () => {
    const material = createBoundsGuideFrontLineMaterial();
    expect(material.vertexShader).toContain('lineStart');
    expect(material.vertexShader).toContain('lineEnd');
    expect(material.vertexShader).toContain('vScreenStart');
    expect(material.vertexShader).toContain('vScreenEnd');
    expect(material.fragmentShader).toContain('gl_FragCoord');
    expect(material.fragmentShader).toContain('distAlong');
    expect(material.fragmentShader).toContain('discard');
    expect(material.fragmentShader).not.toContain('vPixelFromTip');
    expect(typeof material.onBeforeRender).toBe('function');
    material.dispose();
  });

  it('should refresh the viewport uniform from the active drawing viewport', () => {
    const material = createBoundsGuideFrontLineMaterial();
    const renderer = {
      getCurrentViewport: (target: THREE.Vector4) => target.set(10, 20, 640, 360),
    } as unknown as THREE.WebGLRenderer;
    material.onBeforeRender!(
      renderer,
      {} as THREE.Scene,
      {} as THREE.Camera,
      {} as THREE.BufferGeometry,
      {} as THREE.Object3D,
      new THREE.Group(),
    );
    const viewport = material.uniforms['viewport']!.value as THREE.Vector4;
    expect(viewport.x).toBe(10);
    expect(viewport.y).toBe(20);
    expect(viewport.z).toBe(640);
    expect(viewport.w).toBe(360);
    material.dispose();
  });

  it('should use a fixed pixel period of dash then gap along the line', () => {
    expect(isBoundsGuideDashPixelDrawn(0)).toBe(true);
    expect(isBoundsGuideDashPixelDrawn(BOUNDS_GUIDE_DASH_PIXELS - 0.1)).toBe(true);
    expect(isBoundsGuideDashPixelDrawn(BOUNDS_GUIDE_DASH_PIXELS + 0.1)).toBe(false);
    expect(isBoundsGuideDashPixelDrawn(BOUNDS_GUIDE_DASH_PIXELS + BOUNDS_GUIDE_GAP_PIXELS + 0.1)).toBe(true);
  });

  it('should measure screen distance along a segment without depth influence', () => {
    // Horizontal segment 100px long: midpoint is 50px from start.
    expect(measureScreenPixelDistanceAlongSegment(50, 10, 0, 10, 100, 10)).toBeCloseTo(50);
    // Vertical segment.
    expect(measureScreenPixelDistanceAlongSegment(5, 25, 5, 0, 5, 100)).toBeCloseTo(25);
    // Diagonal 3-4-5: point 3/5 of the way.
    expect(measureScreenPixelDistanceAlongSegment(3, 4, 0, 0, 6, 8)).toBeCloseTo(5);
  });
});
