import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { GizmoBuilderBase } from './gizmo_builder_base.js';
import { GizmoVisualStyle, createGizmoPickMesh } from './gizmo_visual_style.js';

/**
 * Creates the scale transform gizmo with thin stems/tips and thicker invisible
 * pick volumes for easier clicking.
 */
export class GizmoScale extends GizmoBuilderBase {
  /**
   * Creates a new scale gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    super(theme);
  }

  /**
   * Creates all 3 scale handles and returns them.
   *
   * @returns An array of GizmoHandle instances for X, Y, Z axes.
   */
  createHandles(): GizmoHandle[] {
    this.beginHandleBuild();
    for (const spec of this.listStandardAxisSpecs()) {
      this.createScaleHandle(spec.axis, spec.color, spec.direction);
    }
    return this.handles;
  }

  /**
   * Creates a single scale handle with a stem, tip, and thick pick volumes.
   *
   * @param axis The gizmo axis for this handle.
   * @param color The hex color of the handle.
   * @param direction The unit direction vector for the handle orientation.
   */
  private createScaleHandle(axis: GizmoAxis, color: number, direction: THREE.Vector3): void {
    const group = new THREE.Group();
    const lineMesh = this.createScaleStemMesh(color);
    const tipMesh = this.createScaleTipMesh(color);
    const handle = new GizmoHandle(axis, color, tipMesh);
    this.attachScaleHandleMeshes(group, lineMesh, tipMesh, handle.getHandleId());
    this.alignGroupLocalYToDirection(group, direction);
    this.registerSceneRoot(group);
    this.registerHandle(handle);
  }

  /**
   * Creates the thin scale stem cylinder.
   *
   * @param color Axis color.
   * @returns Front stem mesh.
   */
  private createScaleStemMesh(color: number): THREE.Mesh {
    const lineGeometry = new THREE.CylinderGeometry(
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.scaleStemLength,
      8,
    );
    const lineMesh = this.createFrontMesh(lineGeometry, color);
    lineMesh.position.set(0, GizmoVisualStyle.scaleStemLength * 0.5, 0);
    return lineMesh;
  }

  /**
   * Creates the scale tip cube.
   *
   * @param color Axis color.
   * @returns Front tip mesh.
   */
  private createScaleTipMesh(color: number): THREE.Mesh {
    const tipSize = GizmoVisualStyle.scaleTipSize;
    const tipGeometry = new THREE.BoxGeometry(tipSize, tipSize, tipSize);
    const tipMesh = this.createFrontMesh(tipGeometry, color);
    tipMesh.position.set(0, GizmoVisualStyle.scaleStemLength, 0);
    return tipMesh;
  }

  /**
   * Tags, ghosts, pick-volumes, and parents scale stem and tip.
   *
   * @param group Scale handle group.
   * @param lineMesh Visual stem.
   * @param tipMesh Visual tip.
   * @param handleId Shared handle id.
   */
  private attachScaleHandleMeshes(
    group: THREE.Group,
    lineMesh: THREE.Mesh,
    tipMesh: THREE.Mesh,
    handleId: number,
  ): void {
    this.tagHandleId(lineMesh, handleId);
    this.tagHandleId(tipMesh, handleId);
    this.addOccludedPair(group, lineMesh.geometry, this.materialColorOf(lineMesh), handleId, lineMesh.position);
    this.addOccludedPair(group, tipMesh.geometry, this.materialColorOf(tipMesh), handleId, tipMesh.position);
    this.addScalePickVolumes(group, handleId, lineMesh.position, tipMesh.position);
    group.add(lineMesh);
    group.add(tipMesh);
  }

  /**
   * Adds invisible thicker pick meshes for stem and tip.
   *
   * @param group Scale handle group.
   * @param handleId Shared handle id.
   * @param linePosition Local stem center.
   * @param tipPosition Local tip center.
   */
  private addScalePickVolumes(
    group: THREE.Group,
    handleId: number,
    linePosition: THREE.Vector3,
    tipPosition: THREE.Vector3,
  ): void {
    const stemPick = createGizmoPickMesh(
      new THREE.CylinderGeometry(
        GizmoVisualStyle.stemPickRadius,
        GizmoVisualStyle.stemPickRadius,
        GizmoVisualStyle.scaleStemLength,
        8,
      ),
      handleId,
    );
    stemPick.position.copy(linePosition);
    const pickSize = GizmoVisualStyle.scaleTipPickSize;
    const tipPick = createGizmoPickMesh(new THREE.BoxGeometry(pickSize, pickSize, pickSize), handleId);
    tipPick.position.copy(tipPosition);
    group.add(stemPick);
    group.add(tipPick);
  }
}
