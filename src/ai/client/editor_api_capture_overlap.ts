import * as THREE from 'three';
import { SOLID_BRUSH_OPERATION_USERDATA_KEY, SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Saved visibility/material for restore after overlap capture. */
interface OverlapObjectSnapshot {
  object: THREE.Object3D;
  visible: boolean;
  material: THREE.Material | THREE.Material[] | null;
}

/**
 * Prepares the scene for brush-overlap capture: CSG results hidden, brush hulls
 * shown with translucent overdraw so intersections light up. Returns a restore
 * callback that puts materials and visibility back.
 *
 * @param scene Shared editor scene.
 * @returns Restore callback.
 */
export function prepareOverlapCaptureMaterials(scene: THREE.Scene): () => void {
  const snapshots: OverlapObjectSnapshot[] = [];
  const ownedMaterials: THREE.Material[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    if (isResultMesh(object)) {
      snapshots.push({ object, visible: object.visible, material: null });
      object.visible = false;
      return;
    }
    if (!isSolidBrushMesh(object)) {
      return;
    }
    snapshots.push({
      object,
      visible: object.visible,
      material: object.material,
    });
    object.visible = true;
    const overlapMaterial = createOverlapMaterial(readBrushOperation(object));
    ownedMaterials.push(overlapMaterial);
    object.material = overlapMaterial;
  });
  return () => restoreOverlapCapture(snapshots, ownedMaterials);
}

/**
 * Builds a translucent overdraw material for one brush hull. Additive brushes:
 * cool cyan. Subtractive: warm red. Intersecting: violet. Overlaps stack
 * brighter where volumes intersect.
 *
 * @param operation Brush CSG operation.
 * @returns MeshBasicMaterial for overdraw.
 */
function createOverlapMaterial(operation: SolidOperation): THREE.MeshBasicMaterial {
  const color = colorForOperation(operation);
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Picks an overdraw color for a CSG operation.
 *
 * @param operation Solid operation.
 * @returns Hex color.
 */
function colorForOperation(operation: SolidOperation): number {
  if (operation === SolidOperation.Subtractive) {
    return 0xe86a17;
  }
  if (operation === SolidOperation.Intersecting) {
    return 0xb07cff;
  }
  return 0x3db8c9;
}

/**
 * Returns whether a mesh is a solid brush volume helper.
 *
 * @param mesh Candidate mesh.
 * @returns True for brush hulls.
 */
function isSolidBrushMesh(mesh: THREE.Mesh): boolean {
  return mesh.userData[SOLID_BRUSH_USERDATA_KEY] === true;
}

/**
 * Reads the CSG operation stored on a brush mesh.
 *
 * @param mesh Brush mesh.
 * @returns Operation enum value.
 */
function readBrushOperation(mesh: THREE.Mesh): SolidOperation {
  const value = mesh.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY];
  if (value === SolidOperation.Subtractive || value === 'subtractive') {
    return SolidOperation.Subtractive;
  }
  if (value === SolidOperation.Intersecting || value === 'intersecting') {
    return SolidOperation.Intersecting;
  }
  return SolidOperation.Additive;
}

/**
 * Restores visibility and materials after an overlap capture.
 *
 * @param snapshots Prior object states.
 * @param ownedMaterials Temporary materials to dispose.
 */
function restoreOverlapCapture(
  snapshots: readonly OverlapObjectSnapshot[],
  ownedMaterials: readonly THREE.Material[],
): void {
  for (const snapshot of snapshots) {
    snapshot.object.visible = snapshot.visible;
    if (snapshot.material !== null && snapshot.object instanceof THREE.Mesh) {
      snapshot.object.material = snapshot.material;
    }
  }
  for (const material of ownedMaterials) {
    material.dispose();
  }
}
