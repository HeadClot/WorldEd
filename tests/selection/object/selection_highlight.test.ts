import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../../src/theme.js';
import {
  SelectionHighlight,
  SELECTION_HIGHLIGHT_USERDATA_KEY,
} from '../../../src/selection/object/selection_highlight.js';

describe('SelectionHighlight', () => {
  let scene: THREE.Scene;
  let highlight: SelectionHighlight;
  let testMesh: THREE.Mesh;

  beforeEach(() => {
    scene = new THREE.Scene();
    highlight = new SelectionHighlight(scene, Theme);
    testMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  });

  it('should create without errors', () => {
    expect(highlight).toBeDefined();
  });

  it('should apply dual-pass highlight edges to a mesh', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    expect(collectSelectionLines(testMesh).length).toBe(2);
  });

  it('should not reparent a mesh into the scene when applying highlight', () => {
    const world = new THREE.Group();
    world.add(testMesh);
    scene.add(world);
    highlight.apply(testMesh);
    expect(testMesh.parent).toBe(world);
    expect(scene.children.includes(testMesh)).toBe(false);
  });

  it('should ignore meshes that are not in this scene graph', () => {
    highlight.apply(testMesh);
    expect(testMesh.children.length).toBe(0);
    expect(highlight.getHighlightedMeshes().size).toBe(0);
  });

  it('should use the correct selection color for highlights', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const materials = collectSelectionMaterials(testMesh);
    expect(materials.length).toBeGreaterThan(0);
    materials.forEach((material) => {
      expect(material.color.getHex()).toBe(Theme.selectionColor);
    });
  });

  it('should use soft dual-pass depth materials instead of always-on-top lines', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const materials = collectSelectionMaterials(testMesh);
    expect(materials.length).toBe(2);
    const front = materials.find((material) => material.depthFunc === THREE.LessEqualDepth);
    const occluded = materials.find((material) => material.depthFunc === THREE.GreaterDepth);
    expect(front).toBeDefined();
    expect(occluded).toBeDefined();
    expect(front!.depthTest).toBe(true);
    expect(occluded!.depthTest).toBe(true);
    expect(front!.transparent).toBe(true);
    expect(occluded!.transparent).toBe(true);
    expect(front!.opacity).toBeLessThan(1);
    expect(front!.opacity).toBeGreaterThan(occluded!.opacity);
  });

  it('should not duplicate highlights on repeated apply calls', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    highlight.apply(testMesh);
    const outlineGroups = testMesh.children.filter(
      (child) => child instanceof THREE.Group && child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true,
    );
    expect(outlineGroups.length).toBe(1);
    expect(collectSelectionLines(testMesh).length).toBe(2);
  });

  it('should remove highlight from a mesh', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    highlight.remove(testMesh);
    expect(collectSelectionLines(testMesh).length).toBe(0);
  });

  it('should handle removal of non-highlighted mesh without error', () => {
    scene.add(testMesh);
    expect(() => highlight.remove(testMesh)).not.toThrow();
  });

  it('should clear all highlights', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh1);
    scene.add(mesh2);
    highlight.apply(mesh1);
    highlight.apply(mesh2);
    highlight.clearAll();
    expect(collectSelectionLines(mesh1).length).toBe(0);
    expect(collectSelectionLines(mesh2).length).toBe(0);
  });

  it('should update color on all active highlights', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh1);
    scene.add(mesh2);
    highlight.apply(mesh1);
    highlight.apply(mesh2);
    const newColor = 0xff0000;
    highlight.updateColor(newColor);
    collectSelectionMaterials(mesh1).forEach((material) => {
      expect(material.color.getHex()).toBe(newColor);
    });
    collectSelectionMaterials(mesh2).forEach((material) => {
      expect(material.color.getHex()).toBe(newColor);
    });
  });

  it('should track highlighted meshes correctly', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const highlighted = highlight.getHighlightedMeshes();
    expect(highlighted.has(testMesh)).toBe(true);
    expect(highlighted.size).toBe(1);
  });

  it('should dispose and clean up highlights', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    highlight.dispose();
    expect(collectSelectionLines(testMesh).length).toBe(0);
  });

  it('should keep outline parented at local origin after syncTransforms', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    testMesh.position.set(4, 5, 6);
    highlight.syncTransforms();
    const outlineGroup = testMesh.children.find(
      (child) => child instanceof THREE.Group && child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true,
    ) as THREE.Group;
    expect(outlineGroup.parent).toBe(testMesh);
    expect(outlineGroup.position.x).toBe(0);
    expect(outlineGroup.position.y).toBe(0);
    expect(outlineGroup.position.z).toBe(0);
  });

  it('should follow mesh translation because outline is a child', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const outlineGroup = testMesh.children.find(
      (child) => child instanceof THREE.Group && child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true,
    ) as THREE.Group;
    testMesh.position.set(7, 8, 9);
    testMesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    outlineGroup.getWorldPosition(worldPos);
    expect(worldPos.x).toBeCloseTo(7);
    expect(worldPos.y).toBeCloseTo(8);
    expect(worldPos.z).toBeCloseTo(9);
  });
});

/**
 * Collects selection outline line segments under a mesh.
 *
 * @param mesh Mesh that may own a selection outline group.
 * @returns Line segments used for selection edges.
 */
function collectSelectionLines(mesh: THREE.Mesh): THREE.LineSegments[] {
  const lines: THREE.LineSegments[] = [];
  mesh.traverse((child) => {
    if (child instanceof THREE.LineSegments && child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) {
      lines.push(child);
    }
  });
  return lines;
}

/**
 * Collects unique selection line materials under a mesh.
 *
 * @param mesh Mesh that may own selection outlines.
 * @returns Distinct line materials.
 */
function collectSelectionMaterials(mesh: THREE.Mesh): THREE.LineBasicMaterial[] {
  const materials = new Set<THREE.LineBasicMaterial>();
  collectSelectionLines(mesh).forEach((line) => {
    if (line.material instanceof THREE.LineBasicMaterial) {
      materials.add(line.material);
    }
  });
  return Array.from(materials);
}
