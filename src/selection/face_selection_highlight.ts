import * as THREE from 'three';
import { Theme } from '../theme.js';
import { FaceSelection } from './face_selection_manager.js';
import { getTriangleVertexIndices, getVertexPosition } from './triangle_geometry_utils.js';
import { GizmoVisualStyle } from '../transform/gizmo_visual_style.js';

/**
 * Opacity for face highlights that pass the depth test (in front).
 */
const FACE_HIGHLIGHT_FRONT_OPACITY = 0.45;

/**
 * Opacity for face highlights occluded by other scene geometry.
 */
const FACE_HIGHLIGHT_OCCLUDED_OPACITY = 0.18;

/**
 * Renders orange face-selection overlays with gizmo-style depth treatment.
 * Unoccluded faces stay bright; faces behind other geometry draw as ghosts.
 * All selected triangles on one mesh share a single dual-pass mesh so complex
 * CSG faces do not create thousands of draw calls.
 */
export class FaceSelectionHighlight {
  private scene: THREE.Scene;
  private highlightGroup: THREE.Group;
  private frontMaterial: THREE.MeshBasicMaterial;
  private occludedMaterial: THREE.MeshBasicMaterial;
  /** One dual-pass group per source mesh uuid. */
  private meshGroups: Map<string, THREE.Group>;

  /**
   * Creates a new face highlight renderer and adds it to the scene.
   * @param scene The scene to add the highlight group to.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.highlightGroup = new THREE.Group();
    this.frontMaterial = this.createFrontMaterial();
    this.occludedMaterial = this.createOccludedMaterial();
    this.meshGroups = new Map();
    this.scene.add(this.highlightGroup);
  }

  /**
   * Creates the bright front-pass material used where the face is unoccluded.
   * @returns Configured MeshBasicMaterial.
   */
  private createFrontMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: Theme.selectionColor,
      transparent: true,
      opacity: FACE_HIGHLIGHT_FRONT_OPACITY,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  /**
   * Creates the ghost material used where the face is behind other geometry.
   * @returns Configured MeshBasicMaterial.
   */
  private createOccludedMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: Theme.selectionColor,
      transparent: true,
      opacity: FACE_HIGHLIGHT_OCCLUDED_OPACITY,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  /**
   * Updates the highlight to show the given set of selected faces.
   * Rebuilds batched mesh overlays (selection changes are infrequent).
   * @param faces The array of face selections to highlight.
   */
  setSelectedFaces(faces: FaceSelection[]): void {
    this.clearHighlights();
    if (faces.length === 0) return;
    const byMesh = this.groupFacesByMesh(faces);
    byMesh.forEach((faceIndices, mesh) => {
      const group = this.buildBatchedMeshHighlight(mesh, faceIndices);
      if (!group) return;
      this.highlightGroup.add(group);
      this.meshGroups.set(mesh.uuid, group);
    });
  }

  /**
   * Buckets face selections by owning mesh.
   * @param faces Face selection entries.
   * @returns Map from mesh to triangle indices.
   */
  private groupFacesByMesh(faces: FaceSelection[]): Map<THREE.Mesh, number[]> {
    const byMesh = new Map<THREE.Mesh, number[]>();
    for (const entry of faces) {
      const list = byMesh.get(entry.mesh);
      if (list) {
        if (!list.includes(entry.faceIndex)) list.push(entry.faceIndex);
      } else {
        byMesh.set(entry.mesh, [entry.faceIndex]);
      }
    }
    return byMesh;
  }

  /**
   * Builds one dual-pass highlight group for all selected triangles on a mesh.
   * @param mesh Source mesh.
   * @param faceIndices Selected triangle indices on that mesh.
   * @returns Dual-pass group, or null when geometry is empty.
   */
  private buildBatchedMeshHighlight(mesh: THREE.Mesh, faceIndices: number[]): THREE.Group | null {
    const geometry = this.buildWorldSpaceBatchedGeometry(mesh, faceIndices);
    if (!geometry) return null;
    const group = new THREE.Group();
    group.userData.isFaceSelectionHighlight = true;
    group.add(this.createOccludedFaceMesh(geometry));
    group.add(this.createFrontFaceMesh(geometry));
    return group;
  }

  /**
   * Builds a single non-indexed world-space mesh for many selected triangles.
   * @param mesh Source mesh.
   * @param faceIndices Triangle indices to include.
   * @returns Batched geometry, or null when no valid triangles exist.
   */
  private buildWorldSpaceBatchedGeometry(
    mesh: THREE.Mesh,
    faceIndices: number[],
  ): THREE.BufferGeometry | null {
    const positions = mesh.geometry.getAttribute('position');
    if (!positions || faceIndices.length === 0) return null;
    mesh.updateMatrixWorld(true);
    const worldMatrix = mesh.matrixWorld;
    const floats = new Float32Array(faceIndices.length * 9);
    let write = 0;
    const scratch = new THREE.Vector3();
    for (const faceIndex of faceIndices) {
      const [i0, i1, i2] = getTriangleVertexIndices(mesh.geometry, faceIndex);
      write = this.writeWorldVertex(positions, i0, worldMatrix, floats, write, scratch);
      write = this.writeWorldVertex(positions, i1, worldMatrix, floats, write, scratch);
      write = this.writeWorldVertex(positions, i2, worldMatrix, floats, write, scratch);
    }
    if (write === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(floats, 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }

  /**
   * Writes one transformed vertex into the batch float buffer.
   * @param positions Position attribute.
   * @param vertexIndex Attribute vertex index.
   * @param worldMatrix Mesh world matrix.
   * @param floats Destination float buffer.
   * @param write Next float write index.
   * @param scratch Scratch vector.
   * @returns Updated write index.
   */
  private writeWorldVertex(
    positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    vertexIndex: number,
    worldMatrix: THREE.Matrix4,
    floats: Float32Array,
    write: number,
    scratch: THREE.Vector3,
  ): number {
    scratch.copy(getVertexPosition(positions, vertexIndex)).applyMatrix4(worldMatrix);
    floats[write] = scratch.x;
    floats[write + 1] = scratch.y;
    floats[write + 2] = scratch.z;
    return write + 3;
  }

  /**
   * Creates the bright front-pass mesh for a face highlight.
   * @param geometry Shared triangle geometry.
   * @returns Front highlight mesh.
   */
  private createFrontFaceMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.frontMaterial);
    mesh.renderOrder = GizmoVisualStyle.frontRenderOrder;
    mesh.userData.isFaceSelectionHighlight = true;
    mesh.frustumCulled = true;
    return mesh;
  }

  /**
   * Creates the ghost mesh drawn only where the face is occluded.
   * @param geometry Shared triangle geometry.
   * @returns Occluded highlight mesh.
   */
  private createOccludedFaceMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.occludedMaterial);
    mesh.renderOrder = GizmoVisualStyle.occludedRenderOrder;
    mesh.userData.isFaceSelectionHighlight = true;
    mesh.userData.isFaceSelectionHighlightOccluded = true;
    mesh.frustumCulled = true;
    return mesh;
  }

  /**
   * Removes a mesh group from the scene and disposes its geometry.
   * @param group The dual-pass face highlight group.
   */
  private disposeFaceGroup(group: THREE.Group): void {
    this.highlightGroup.remove(group);
    const geometry = this.findSharedGeometry(group);
    if (geometry) geometry.dispose();
  }

  /**
   * Finds the shared triangle geometry used by a face highlight group.
   * @param group Face highlight group containing front and occluded meshes.
   * @returns Shared geometry, or null when missing.
   */
  private findSharedGeometry(group: THREE.Group): THREE.BufferGeometry | null {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh && child.geometry) {
        return child.geometry;
      }
    }
    return null;
  }

  /**
   * Removes all face highlights from the scene.
   */
  private clearHighlights(): void {
    this.meshGroups.forEach((group) => {
      this.disposeFaceGroup(group);
    });
    this.meshGroups.clear();
  }

  /**
   * Disposes all highlight resources and removes the group from the scene.
   */
  dispose(): void {
    this.clearHighlights();
    this.scene.remove(this.highlightGroup);
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }

  /**
   * Returns the count of active highlight mesh groups (one per source mesh).
   * @returns The number of batched highlight groups.
   */
  getHighlightCount(): number {
    return this.meshGroups.size;
  }
}
