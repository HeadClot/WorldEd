import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { GizmoBuilderBase } from './gizmo_builder_base.js';
import { GizmoVisualStyle, createGizmoOccludedMesh, createGizmoPickMesh } from './gizmo_visual_style.js';

/**
 * Creates the rotate transform gizmo with thin torus rings for each axis and
 * thicker invisible pick tori so rings are easy to grab without looking fat.
 */
export class GizmoRotate extends GizmoBuilderBase {
  /**
   * Creates a new rotate gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    super(theme);
  }

  /**
   * Creates all 3 rotate handles and returns them.
   *
   * @returns An array of GizmoHandle instances for X, Y, Z axes.
   */
  createHandles(): GizmoHandle[] {
    this.beginHandleBuild();
    for (const spec of this.listStandardAxisSpecs()) {
      this.createRing(spec.axis, spec.color, spec.direction);
    }
    return this.handles;
  }

  /**
   * Creates a single ring handle with front, occluded ghost, and pick meshes.
   *
   * @param axis The gizmo axis for this ring.
   * @param color The hex color of the ring.
   * @param axisDirection The direction vector of the rotation axis.
   */
  private createRing(axis: GizmoAxis, color: number, axisDirection: THREE.Vector3): void {
    const group = new THREE.Group();
    const geometry = new THREE.TorusGeometry(GizmoVisualStyle.ringRadius, GizmoVisualStyle.stemRadius, 12, 64);
    const frontMesh = this.createFrontMesh(geometry, color);
    const handle = new GizmoHandle(axis, color, frontMesh);
    this.attachRingMeshes(group, geometry, frontMesh, color, handle.getHandleId());
    this.alignGroupLocalZToDirection(group, axisDirection);
    this.registerSceneRoot(group);
    this.registerHandle(handle);
  }

  /**
   * Tags the front mesh and adds ghost plus thick pick torus under the ring
   * group.
   *
   * @param group Ring handle group.
   * @param geometry Shared torus geometry for front and ghost.
   * @param frontMesh Visible front ring.
   * @param color Axis color.
   * @param handleId Shared handle id.
   */
  private attachRingMeshes(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    frontMesh: THREE.Mesh,
    color: number,
    handleId: number,
  ): void {
    this.tagHandleId(frontMesh, handleId);
    group.add(
      createGizmoPickMesh(
        new THREE.TorusGeometry(GizmoVisualStyle.ringRadius, GizmoVisualStyle.ringPickTubeRadius, 10, 48),
        handleId,
      ),
    );
    group.add(createGizmoOccludedMesh(geometry, color, handleId));
    group.add(frontMesh);
  }
}
