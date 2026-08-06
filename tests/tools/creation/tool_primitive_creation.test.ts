import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { getGeometrySource, resolveGeometrySourceType } from '@/texture/uv/geometry_source.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { formatHierarchyHexIndex, hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/**
 * Returns the range of U and V coordinates on a mesh.
 *
 * @param mesh Mesh with a UV attribute.
 * @returns Spans along U and V.
 */
function measureUvSpans(mesh: THREE.Mesh): { uSpan: number; vSpan: number } {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let index = 0; index < uv.count; index++) {
    minU = Math.min(minU, uv.getX(index));
    maxU = Math.max(maxU, uv.getX(index));
    minV = Math.min(minV, uv.getY(index));
    maxV = Math.max(maxV, uv.getY(index));
  }
  return { uSpan: maxU - minU, vSpan: maxV - minV };
}

describe('ToolPrimitiveCreation', () => {
  let scene: THREE.Scene;
  let tool: ToolPrimitiveCreation;

  beforeEach(() => {
    hierarchyNameAllocator.reset();
    scene = new THREE.Scene();
    tool = new ToolPrimitiveCreation(scene);
  });

  it('should start with zero created objects', () => {
    expect(tool.getCreatedObjectCount()).toBe(0);
  });

  it('should start with null last created object', () => {
    expect(tool.getLastCreatedObject()).toBeNull();
  });

  it('should create a box with correct geometry type', () => {
    const mesh = tool.createBox(1, 1, 1);
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('box');
  });

  it('should create a box with correct dimensions', () => {
    const mesh = tool.createBox(2, 3, 4);
    const source = getGeometrySource(mesh.geometry);
    expect(source?.params['width']).toBe(2);
    expect(source?.params['height']).toBe(3);
    expect(source?.params['depth']).toBe(4);
  });

  it('should create a box with n-gon quads and centered UVs like solid brushes', () => {
    const mesh = tool.createBox(1, 1, 1);
    const document = mesh.userData['meshDocument'] as { getTopology: () => { getFaceCount: () => number } };
    expect(document.getTopology().getFaceCount()).toBe(6);
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    expect(uv).toBeDefined();
    let minU = Infinity;
    let maxU = -Infinity;
    for (let index = 0; index < uv.count; index++) {
      minU = Math.min(minU, uv.getX(index));
      maxU = Math.max(maxU, uv.getX(index));
    }
    expect(minU).toBeLessThan(0.25);
    expect(maxU).toBeGreaterThan(0.75);
  });

  it('should name box with auto-incremented number', () => {
    const mesh1 = tool.createBox(1, 1, 1);
    const mesh2 = tool.createBox(1, 1, 1);
    expect(mesh1.name).toBe(`Cube.${formatHierarchyHexIndex(1)}`);
    expect(mesh2.name).toBe(`Cube.${formatHierarchyHexIndex(2)}`);
  });

  it('should create a sphere with correct geometry type', () => {
    const mesh = tool.createSphere(1);
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('sphere');
  });

  it('should create a sphere with correct radius', () => {
    const mesh = tool.createSphere(2.5);
    const source = getGeometrySource(mesh.geometry);
    expect(source?.params['radius']).toBe(2.5);
  });

  it('should name sphere with auto-incremented number', () => {
    const mesh1 = tool.createSphere(1);
    const mesh2 = tool.createSphere(1);
    expect(mesh1.name).toBe(`Sphere.${formatHierarchyHexIndex(1)}`);
    expect(mesh2.name).toBe(`Sphere.${formatHierarchyHexIndex(2)}`);
  });

  it('should create a cylinder with correct geometry type', () => {
    const mesh = tool.createCylinder(1, 1, 2);
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('cylinder');
  });

  it('should create a cylinder with correct dimensions', () => {
    const mesh = tool.createCylinder(0.5, 1.0, 3);
    const source = getGeometrySource(mesh.geometry);
    expect(source?.params['radiusTop']).toBe(0.5);
    expect(source?.params['radiusBottom']).toBe(1.0);
    expect(source?.params['height']).toBe(3);
  });

  it('should name cylinder with auto-incremented number', () => {
    const mesh1 = tool.createCylinder(1, 1, 1);
    const mesh2 = tool.createCylinder(1, 1, 1);
    expect(mesh1.name).toBe(`Cylinder.${formatHierarchyHexIndex(1)}`);
    expect(mesh2.name).toBe(`Cylinder.${formatHierarchyHexIndex(2)}`);
  });

  it('should create a plane with correct geometry type', () => {
    const mesh = tool.createPlane(1, 1);
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('plane');
  });

  it('should rotate plane to be horizontal', () => {
    const mesh = tool.createPlane(1, 1);
    expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it('should keep both plane UV axes after world rebake from scale', () => {
    const mesh = tool.createPlane(2, 2);
    const settings = new TextureLockSettings(true, false);
    mesh.scale.set(2, 1, 1);
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], false, true);
    const spans = measureUvSpans(mesh);
    expect(spans.uSpan).toBeGreaterThan(1);
    expect(spans.vSpan).toBeGreaterThan(1);
  });

  it('should keep both plane UV axes after world rebake from move', () => {
    const mesh = tool.createPlane(2, 2);
    const settings = new TextureLockSettings(false, true);
    mesh.position.set(3, 0, 4);
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], true, false);
    const spans = measureUvSpans(mesh);
    expect(spans.uSpan).toBeGreaterThan(1);
    expect(spans.vSpan).toBeGreaterThan(1);
  });

  it('should still rebake cube UVs on scale without collapsing a face axis', () => {
    const mesh = tool.createBox(2, 2, 2);
    const settings = new TextureLockSettings(true, false);
    const before = measureUvSpans(mesh);
    mesh.scale.set(2, 1, 1);
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], false, true);
    const after = measureUvSpans(mesh);
    expect(after.uSpan).toBeGreaterThan(before.uSpan * 0.5);
    expect(after.vSpan).toBeGreaterThan(0.5);
  });

  it('should name plane with auto-incremented number', () => {
    const mesh1 = tool.createPlane(1, 1);
    const mesh2 = tool.createPlane(1, 1);
    expect(mesh1.name).toBe(`Plane.${formatHierarchyHexIndex(1)}`);
    expect(mesh2.name).toBe(`Plane.${formatHierarchyHexIndex(2)}`);
  });

  it('should use theme box color for materials', () => {
    const mesh = tool.createBox(1, 1, 1);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(Theme.boxColor);
  });

  it('should add edge wireframe to created objects', () => {
    const mesh = tool.createBox(1, 1, 1);
    const lineSegments = mesh.children.find((child) => child instanceof THREE.LineSegments);
    expect(lineSegments).toBeDefined();
  });

  it('should leave parenting to the create command stack', () => {
    const mesh = tool.createBox(1, 1, 1);
    expect(mesh.parent).toBeNull();
    expect(scene.children.includes(mesh)).toBe(false);
  });

  it('should track last created object', () => {
    tool.createBox(1, 1, 1);
    const mesh2 = tool.createSphere(1);
    expect(tool.getLastCreatedObject()).toBe(mesh2);
  });

  it('should correctly count all created objects', () => {
    tool.createBox(1, 1, 1);
    tool.createSphere(1);
    tool.createCylinder(1, 1, 1);
    tool.createPlane(1, 1);
    expect(tool.getCreatedObjectCount()).toBe(4);
  });

  it('should position object when position is provided', () => {
    const pos = new THREE.Vector3(3, 4, 5);
    const mesh = tool.createBox(1, 1, 1, pos);
    expect(mesh.position.x).toBe(3);
    expect(mesh.position.y).toBe(4);
    expect(mesh.position.z).toBe(5);
  });

  it('should use origin position when no position is provided', () => {
    const mesh = tool.createBox(1, 1, 1);
    expect(mesh.position.x).toBe(0);
    expect(mesh.position.y).toBe(0);
    expect(mesh.position.z).toBe(0);
  });

  it('should reset last created on dispose', () => {
    tool.createBox(1, 1, 1);
    tool.dispose();
    expect(tool.getLastCreatedObject()).toBeNull();
  });
});
