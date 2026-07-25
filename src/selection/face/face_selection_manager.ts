import * as THREE from 'three';
import { computeTriangleNormal } from '../pick/triangle_geometry_utils.js';
import { expandFaceSelectionIndices, findSameSolidBrushSurfaceIndices } from './solid_result_face_indices.js';
import { buildFacePickRegionKey } from './solid_triangle_source_index.js';

/** A single face selection entry referencing a mesh and a face index. */
export interface FaceSelection {
  mesh: THREE.Mesh;
  faceIndex: number;
}

/**
 * Callback invoked when the face selection set changes.
 *
 * @param selected The current set of face selections.
 */
export type FaceSelectionChangedCallback = (selected: FaceSelection[]) => void;

/**
 * Manages selection of polygonal faces on meshes. Solid CSG results store one
 * entry per authored brush face (region), not every fragmented triangle —
 * critical for large VMF-style solids. Ordinary meshes expand to coplanar
 * triangles as before.
 */
export class FaceSelectionManager {
  private selectedFaces: FaceSelection[];
  /** Region keys (solid brush faces) or mesh:triangle keys already selected. */
  private readonly selectedRegionKeys: Set<string>;
  private changeCallback: FaceSelectionChangedCallback | null;

  /** Creates a new face selection manager with an empty selection. */
  constructor() {
    this.selectedFaces = [];
    this.selectedRegionKeys = new Set();
    this.changeCallback = null;
  }

  /**
   * Selects a face on a mesh. Solid results add one region seed; ordinary
   * meshes expand to the full coplanar face unit when expandFace is true.
   *
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index of the face to select.
   * @param addToSelection Whether to add to existing selection or replace it.
   * @param expandFace When true, expands ordinary meshes to coplanar faces.
   */
  selectFace(mesh: THREE.Mesh, faceIndex: number, addToSelection: boolean, expandFace: boolean = true): void {
    if (!addToSelection) {
      this.selectedFaces = [];
      this.selectedRegionKeys.clear();
    }
    if (this.isSolidResultMesh(mesh)) {
      this.selectSolidRegion(mesh, faceIndex);
      return;
    }
    this.selectOrdinaryFace(mesh, faceIndex, expandFace);
  }

  /** Clears all selected faces. */
  deselectAll(): void {
    if (this.selectedFaces.length === 0) return;
    this.selectedFaces = [];
    this.selectedRegionKeys.clear();
    this.notifyChange();
  }

  /**
   * Removes a specific face (or its solid region) from the selection.
   *
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index of the face to remove.
   */
  removeFace(mesh: THREE.Mesh, faceIndex: number): void {
    const regionKey = buildFacePickRegionKey(mesh, faceIndex);
    if (!this.selectedRegionKeys.has(regionKey)) return;
    this.selectedRegionKeys.delete(regionKey);
    this.selectedFaces = this.selectedFaces.filter(
      (entry) => buildFacePickRegionKey(entry.mesh, entry.faceIndex) !== regionKey,
    );
    this.notifyChange();
  }

  /**
   * Returns the array of currently selected faces (region seeds for solids).
   *
   * @returns The array of face selection entries.
   */
  getSelectedFaces(): FaceSelection[] {
    return this.selectedFaces;
  }

  /**
   * Returns the count of currently selected faces (regions for solid results).
   *
   * @returns The number of selected face units.
   */
  getSelectedFaceCount(): number {
    return this.selectedFaces.length;
  }

  /**
   * Checks whether a triangle belongs to the current selection (including other
   * triangles of the same solid brush face).
   *
   * @param mesh The mesh to check.
   * @param faceIndex The face index to check.
   * @returns True if the face unit is selected.
   */
  isFaceSelected(mesh: THREE.Mesh, faceIndex: number): boolean {
    return this.selectedRegionKeys.has(buildFacePickRegionKey(mesh, faceIndex));
  }

  /**
   * Computes the average normal vector across all selected face seeds.
   *
   * @returns The average normal direction as a Vector3.
   */
  computeAverageNormal(): THREE.Vector3 {
    const normalAccumulator = new THREE.Vector3();
    this.selectedFaces.forEach((entry) => {
      normalAccumulator.add(computeTriangleNormal(entry.mesh.geometry, entry.faceIndex));
    });
    if (this.selectedFaces.length > 0) {
      normalAccumulator.divideScalar(this.selectedFaces.length);
    }
    return normalAccumulator.normalize();
  }

  /**
   * Registers a callback to be invoked on face selection changes.
   *
   * @param callback The function to call when selection changes.
   */
  setSelectionChangedCallback(callback: FaceSelectionChangedCallback): void {
    this.changeCallback = callback;
  }

  /** Clears all state and callbacks. */
  clear(): void {
    this.selectedFaces = [];
    this.selectedRegionKeys.clear();
    this.changeCallback = null;
  }

  /**
   * Adds one solid brush-face region if it is not already selected.
   *
   * @param mesh Solid result mesh.
   * @param faceIndex Seed triangle on that region.
   */
  private selectSolidRegion(mesh: THREE.Mesh, faceIndex: number): void {
    const regionKey = buildFacePickRegionKey(mesh, faceIndex);
    if (this.selectedRegionKeys.has(regionKey)) return;
    this.selectedRegionKeys.add(regionKey);
    this.selectedFaces.push({ mesh, faceIndex });
    this.notifyChange();
  }

  /**
   * Selects ordinary mesh faces with optional coplanar expansion.
   *
   * @param mesh Non-solid mesh.
   * @param faceIndex Seed triangle.
   * @param expandFace Whether to expand to coplanar triangles.
   */
  private selectOrdinaryFace(mesh: THREE.Mesh, faceIndex: number, expandFace: boolean): void {
    const faceIndices = expandFace ? expandFaceSelectionIndices(mesh, faceIndex) : [faceIndex];
    let changed = false;
    for (const index of faceIndices) {
      const regionKey = buildFacePickRegionKey(mesh, index);
      if (this.selectedRegionKeys.has(regionKey)) continue;
      this.selectedRegionKeys.add(regionKey);
      this.selectedFaces.push({ mesh, faceIndex: index });
      changed = true;
    }
    if (changed) {
      this.notifyChange();
    }
  }

  /**
   * Returns whether the mesh carries solid triangle sources (CSG result).
   *
   * @param mesh Candidate mesh.
   * @returns True when solid region selection applies.
   */
  private isSolidResultMesh(mesh: THREE.Mesh): boolean {
    return findSameSolidBrushSurfaceIndices(mesh, 0) !== null;
  }

  /** Notifies the registered callback of a selection change. */
  private notifyChange(): void {
    if (this.changeCallback) {
      this.changeCallback(this.selectedFaces);
    }
  }
}
