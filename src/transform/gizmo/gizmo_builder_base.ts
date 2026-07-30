import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { applyGizmoFrontRenderOrder, createGizmoFrontMaterial, createGizmoOccludedMesh } from './gizmo_visual_style.js';

/** One standard colored axis used by move, rotate, and scale builders. */
export interface GizmoBuilderAxisSpec {
  axis: GizmoAxis;
  color: number;
  direction: THREE.Vector3;
}

/**
 * Shared base for mode-specific gizmo builders (translate, rotate, scale). Owns
 * theme access, handle/root registration, front/occluded mesh helpers, axis
 * alignment, and geometry disposal.
 */
export abstract class GizmoBuilderBase {
  protected readonly theme: typeof Theme;
  protected handles: GizmoHandle[];
  protected sceneRoots: THREE.Object3D[];

  /**
   * Creates a gizmo builder shell.
   *
   * @param theme Theme colors for axis tints.
   */
  protected constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.sceneRoots = [];
  }

  /**
   * Builds all interactive handles for this mode.
   *
   * @returns Handles for raycast id matching.
   */
  abstract createHandles(): GizmoHandle[];

  /**
   * Returns scene roots that must be parented under the transform gizmo group.
   *
   * @returns Object3D roots created by the last createHandles call.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    return [...this.sceneRoots];
  }

  /** Disposes geometries and materials under every registered scene root. */
  dispose(): void {
    for (const root of this.sceneRoots) {
      this.disposeObject3D(root);
    }
    this.sceneRoots = [];
    this.handles = [];
    this.onBuilderDisposed();
  }

  /**
   * Clears handle and root lists before a rebuild. Does not dispose previous
   * meshes; callers that own prior geometry must dispose first.
   */
  protected beginHandleBuild(): void {
    this.handles = [];
    this.sceneRoots = [];
  }

  /** Hook for subclass-specific cleanup after dispose. */
  protected onBuilderDisposed(): void {}

  /**
   * Registers a handle for raycast matching.
   *
   * @param handle Handle created by the subclass.
   */
  protected registerHandle(handle: GizmoHandle): void {
    this.handles.push(handle);
  }

  /**
   * Registers a scene root returned by getAllSceneObjects.
   *
   * @param root Group or object to attach under the mode gizmo.
   */
  protected registerSceneRoot(root: THREE.Object3D): void {
    this.sceneRoots.push(root);
  }

  /**
   * Enumerates the three colored world axes from the theme.
   *
   * @returns Axis, color, and unit direction for X, Y, and Z.
   */
  protected listStandardAxisSpecs(): GizmoBuilderAxisSpec[] {
    return [
      { axis: GizmoAxis.X, color: this.theme.gizmoXAxisColor, direction: new THREE.Vector3(1, 0, 0) },
      { axis: GizmoAxis.Y, color: this.theme.gizmoYAxisColor, direction: new THREE.Vector3(0, 1, 0) },
      { axis: GizmoAxis.Z, color: this.theme.gizmoZAxisColor, direction: new THREE.Vector3(0, 0, 1) },
    ];
  }

  /**
   * Builds a front-facing gizmo mesh with shared material styling.
   *
   * @param geometry Mesh geometry.
   * @param color Hex color.
   * @returns Configured front mesh.
   */
  protected createFrontMesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, createGizmoFrontMaterial(color));
    applyGizmoFrontRenderOrder(mesh);
    return mesh;
  }

  /**
   * Stores the handle id on a mesh for raycast matching.
   *
   * @param mesh Mesh to tag.
   * @param handleId Handle identifier.
   */
  protected tagHandleId(mesh: THREE.Mesh, handleId: number): void {
    mesh.userData['handleId'] = handleId;
  }

  /**
   * Adds an occluded ghost mesh at the same local position as a front part.
   *
   * @param group Parent group.
   * @param geometry Shared geometry.
   * @param color Hex color.
   * @param handleId Shared handle id.
   * @param position Local position to copy.
   */
  protected addOccludedPair(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    color: number,
    handleId: number,
    position: THREE.Vector3,
  ): void {
    const ghost = createGizmoOccludedMesh(geometry, color, handleId);
    ghost.position.copy(position);
    group.add(ghost);
  }

  /**
   * Reads the hex color from a mesh basic material.
   *
   * @param mesh Mesh with MeshBasicMaterial.
   * @returns Hex color, or white when unavailable.
   */
  protected materialColorOf(mesh: THREE.Mesh): number {
    const material = mesh.material;
    if (material instanceof THREE.MeshBasicMaterial) {
      return material.color.getHex();
    }
    return 0xffffff;
  }

  /**
   * Aligns a group so its local Y axis points along the given direction.
   *
   * @param group Group to rotate.
   * @param direction Target direction vector.
   */
  protected alignGroupLocalYToDirection(group: THREE.Group, direction: THREE.Vector3): void {
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, direction.clone().normalize());
    group.quaternion.copy(quaternion);
  }

  /**
   * Aligns a group so its local Z axis points along the given direction.
   *
   * @param group Group to rotate.
   * @param direction Target direction vector.
   */
  protected alignGroupLocalZToDirection(group: THREE.Group, direction: THREE.Vector3): void {
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const targetNormal = direction.clone().normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    group.quaternion.copy(quaternion);
  }

  /**
   * Recursively disposes geometries and materials under an object.
   *
   * @param obj Object to dispose.
   */
  protected disposeObject3D(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      this.disposeMesh(obj);
    }
    for (const child of obj.children) {
      this.disposeObject3D(child);
    }
  }

  /**
   * Disposes geometry and materials of one mesh once.
   *
   * @param mesh Mesh to dispose.
   */
  protected disposeMesh(mesh: THREE.Mesh): void {
    this.disposeMeshGeometryOnce(mesh);
    this.disposeMeshMaterial(mesh);
  }

  /**
   * Disposes mesh geometry if it has not already been marked disposed.
   *
   * @param mesh Mesh whose geometry may be shared with a ghost.
   */
  private disposeMeshGeometryOnce(mesh: THREE.Mesh): void {
    if (!mesh.geometry || mesh.userData['geometryDisposed']) {
      return;
    }
    mesh.geometry.dispose();
    mesh.userData['geometryDisposed'] = true;
  }

  /**
   * Disposes mesh materials.
   *
   * @param mesh Mesh with one or more materials.
   */
  private disposeMeshMaterial(mesh: THREE.Mesh): void {
    if (!mesh.material) {
      return;
    }
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) {
        material.dispose();
      }
      return;
    }
    mesh.material.dispose();
  }
}
