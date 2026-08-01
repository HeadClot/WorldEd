import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformConstraint } from './transform_constraint.js';

/**
 * Applies transform operations to selected objects. Handles translation,
 * rotation, and scale with optional snapping. Targets may be meshes or higher
 * hierarchy nodes such as solid model roots.
 */
export class TransformExecutor {
  private gridSnap: GridSnap;
  private boundingBox: THREE.Box3;

  /**
   * Creates a new transform executor with the given grid snap configuration.
   *
   * @param gridSnap The grid snap settings for constraining transforms.
   */
  constructor(gridSnap: GridSnap) {
    this.gridSnap = gridSnap;
    this.boundingBox = new THREE.Box3();
  }

  /**
   * Translates all objects by the given delta without snapping the delta
   * itself. Moved axes snap so world-space bounds sit on the grid (not the
   * pivot alone).
   *
   * @param objects The objects to translate.
   * @param delta The translation delta vector.
   */
  executeTranslation(objects: THREE.Object3D[], delta: THREE.Vector3): void {
    objects.forEach((object) => {
      const start = object.position.clone();
      object.position.add(delta);
      this.snapTranslationOnChangedAxes(object, start);
    });
  }

  /**
   * Sets absolute positions from initial positions plus a total delta. Snaps
   * only axes that moved so unconstrained axes stay put. Snapping aligns object
   * world bounds to the grid, not just the pivot.
   *
   * @param objects The objects to position.
   * @param initialPositions Map of object to pre-drag position.
   * @param totalDelta Accumulated unsnapped translation delta.
   */
  applyAbsoluteTranslation(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    totalDelta: THREE.Vector3,
  ): void {
    objects.forEach((object) => {
      const start = initialPositions.get(object);
      if (!start) return;
      object.position.copy(start).add(totalDelta);
      this.snapTranslationOnChangedAxes(object, start);
    });
  }

  /**
   * Snaps moved translation axes so each world AABB min lands on the grid.
   * Keeps odd-sized brushes (e.g. size 3.75 on a 0.25 grid) face-aligned: the
   * pivot may sit on a half-cell while edges stay on grid lines. Falls back to
   * pivot snapping when geometry bounds are unavailable.
   *
   * @param object The object whose position was just updated.
   * @param startPosition Pre-drag local position used to detect changed axes.
   */
  private snapTranslationOnChangedAxes(object: THREE.Object3D, startPosition: THREE.Vector3): void {
    if (!this.gridSnap.isEnabled()) return;
    const movedX = this.didAxisMove(object.position.x, startPosition.x);
    const movedY = this.didAxisMove(object.position.y, startPosition.y);
    const movedZ = this.didAxisMove(object.position.z, startPosition.z);
    if (!movedX && !movedY && !movedZ) return;
    // Local position writes do not refresh matrixWorld. Solid roots measure a
    // child result mesh for snap, so update this object (and descendants) before
    // measuring, and again after applying the snap correction.
    object.updateMatrixWorld(true);
    const worldBox = this.computeWorldAabb(object);
    if (!worldBox) {
      this.gridSnap.snapChangedAxes(object.position, startPosition);
      object.updateMatrixWorld(true);
      return;
    }
    this.applyBoundsMinSnap(object, worldBox, movedX, movedY, movedZ);
    object.updateMatrixWorld(true);
  }

  /**
   * Returns whether a scalar axis value changed beyond a tiny epsilon.
   *
   * @param current Current axis component.
   * @param start Start axis component.
   * @returns True when the axis should be snapped.
   */
  private didAxisMove(current: number, start: number): boolean {
    return Math.abs(current - start) > 1e-8;
  }

  /**
   * Computes the world-space axis-aligned bounds used for translation snap.
   * Solid model roots snap from the compiled result mesh so the solid surface
   * (and bounds gizmo) land on the grid — not the union of every brush hull and
   * edge batch, which desyncs brushes from the outer solid bounds.
   *
   * @param object The object to measure.
   * @returns World AABB, or null when bounds are unavailable.
   */
  private computeWorldAabb(object: THREE.Object3D): THREE.Box3 | null {
    if (object instanceof THREE.Mesh) {
      return this.computeMeshWorldAabb(object);
    }
    const solidResult = this.resolveSolidResultMeshForSnap(object);
    if (solidResult) {
      const resultBox = this.computeMeshWorldAabb(solidResult);
      if (resultBox) return resultBox;
    }
    object.updateMatrixWorld(true);
    this.boundingBox.setFromObject(object);
    if (this.boundingBox.isEmpty()) return null;
    return this.boundingBox;
  }

  /**
   * Returns the solid result mesh when the object is a solid model root.
   *
   * @param object Candidate transform target.
   * @returns Result mesh for snap, or null.
   */
  private resolveSolidResultMeshForSnap(object: THREE.Object3D): THREE.Mesh | null {
    if (!SolidModel.isSolidModelObject(object)) return null;
    const model = SolidModel.fromObject(object);
    return model?.getResultMesh() ?? null;
  }

  /**
   * Computes world AABB from mesh geometry when present.
   *
   * @param mesh Mesh with optional geometry.
   * @returns World AABB or null.
   */
  private computeMeshWorldAabb(mesh: THREE.Mesh): THREE.Box3 | null {
    const geometry = mesh.geometry;
    if (!geometry) return null;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const localBox = geometry.boundingBox;
    if (!localBox || localBox.isEmpty()) return null;
    mesh.updateMatrixWorld(true);
    this.boundingBox.copy(localBox).applyMatrix4(mesh.matrixWorld);
    return this.boundingBox;
  }

  /**
   * Applies per-axis corrections so world AABB mins snap to the grid.
   *
   * @param object Object to adjust.
   * @param worldBox Current world AABB at the unsnapped position.
   * @param movedX Whether X should snap.
   * @param movedY Whether Y should snap.
   * @param movedZ Whether Z should snap.
   */
  private applyBoundsMinSnap(
    object: THREE.Object3D,
    worldBox: THREE.Box3,
    movedX: boolean,
    movedY: boolean,
    movedZ: boolean,
  ): void {
    if (movedX) {
      object.position.x += this.gridSnap.snapValue(worldBox.min.x) - worldBox.min.x;
    }
    if (movedY) {
      object.position.y += this.gridSnap.snapValue(worldBox.min.y) - worldBox.min.y;
    }
    if (movedZ) {
      object.position.z += this.gridSnap.snapValue(worldBox.min.z) - worldBox.min.z;
    }
  }

  /**
   * Rotates all objects around a pivot point and updates each object's
   * orientation.
   *
   * @param objects The objects to rotate.
   * @param pivot The center point of rotation.
   * @param axis The rotation axis vector.
   * @param angle The rotation angle in radians.
   */
  executeRotation(objects: THREE.Object3D[], pivot: THREE.Vector3, axis: THREE.Vector3, angle: number): void {
    const normalizedAxis = axis.clone().normalize();
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(normalizedAxis, angle);
    objects.forEach((object) => {
      this.rotateObjectAroundPivot(object, pivot, rotationQuaternion);
    });
  }

  /**
   * Applies absolute rotation from pre-drag state using a total angle.
   *
   * @param objects The objects to rotate.
   * @param initialPositions Map of object to pre-drag position.
   * @param initialQuaternions Map of object to pre-drag quaternion.
   * @param pivot The rotation pivot point.
   * @param axis The rotation axis vector.
   * @param totalAngle Accumulated signed rotation angle in radians.
   */
  applyAbsoluteRotation(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    totalAngle: number,
  ): void {
    const snappedAngle = this.gridSnap.snapAngleRadians(totalAngle);
    const normalizedAxis = axis.clone().normalize();
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(normalizedAxis, snappedAngle);
    objects.forEach((object) => {
      this.applyAbsoluteRotationToObject(object, initialPositions, initialQuaternions, pivot, rotationQuaternion);
    });
  }

  /**
   * Scales all objects along an axis relative to a pivot, updating scale.
   *
   * @param objects The objects to scale.
   * @param pivot The center point of scaling.
   * @param axis The scaling axis vector.
   * @param factor The multiplicative scale factor for this step.
   */
  executeScale(objects: THREE.Object3D[], pivot: THREE.Vector3, axis: THREE.Vector3, factor: number): void {
    const normalizedAxis = axis.clone().normalize();
    const safeFactor = Math.max(0.01, factor);
    objects.forEach((object) => {
      this.scaleObjectAlongAxis(object, pivot, normalizedAxis, safeFactor);
    });
  }

  /**
   * Applies absolute scale from pre-drag state using a total factor.
   *
   * @param objects The objects to scale.
   * @param initialPositions Map of object to pre-drag position.
   * @param initialScales Map of object to pre-drag scale.
   * @param pivot The scale pivot point.
   * @param worldAxis World-space direction of the scale handle.
   * @param totalFactor Accumulated scale factor relative to drag start.
   * @param gizmoAxis Which local scale component the handle maps to (X/Y/Z).
   */
  applyAbsoluteScale(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    pivot: THREE.Vector3,
    worldAxis: THREE.Vector3,
    totalFactor: number,
    gizmoAxis: GizmoAxis = GizmoAxis.X,
  ): void {
    const snappedFactor = this.gridSnap.snapScaleFactor(totalFactor);
    const normalizedAxis = worldAxis.clone().normalize();
    objects.forEach((object) => {
      this.applyAbsoluteScaleToObject(
        object,
        initialPositions,
        initialScales,
        pivot,
        normalizedAxis,
        snappedFactor,
        gizmoAxis,
      );
    });
  }

  /**
   * Uniform scale about a world pivot using ScaleAroundPivot on all axes.
   *
   * @param objects The objects to scale.
   * @param initialPositions Map of object to pre-drag local position.
   * @param initialScales Map of object to pre-drag local scale.
   * @param worldPivot World-space scale origin.
   * @param totalFactor Radial distance ratio from drag start.
   */
  applyAbsoluteUniformScale(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    worldPivot: THREE.Vector3,
    totalFactor: number,
  ): void {
    this.applyAbsoluteFreeScale(
      objects,
      initialPositions,
      initialScales,
      worldPivot,
      new THREE.Vector3(totalFactor, totalFactor, totalFactor),
    );
  }

  /**
   * Free scale about a world pivot with independent X/Y/Z multipliers (uniform
   * 3D or planar 2D free-scale from the center cube).
   *
   * @param objects The objects to scale.
   * @param initialPositions Map of object to pre-drag local position.
   * @param initialScales Map of object to pre-drag local scale.
   * @param worldPivot World-space scale origin.
   * @param axisFactors Multipliers per world axis (1 leaves that axis).
   */
  applyAbsoluteFreeScale(
    objects: THREE.Object3D[],
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    const snapped = new THREE.Vector3(
      this.gridSnap.snapScaleFactor(axisFactors.x),
      this.gridSnap.snapScaleFactor(axisFactors.y),
      this.gridSnap.snapScaleFactor(axisFactors.z),
    );
    objects.forEach((object) => {
      this.applyAbsoluteFreeScaleToObject(object, initialPositions, initialScales, worldPivot, snapped);
    });
  }

  /**
   * Computes the center of the bounding box of all objects. Used as the default
   * pivot point for transforms.
   *
   * @param objects The objects to compute the pivot for.
   * @returns The bounding box center point.
   */
  computePivot(objects: THREE.Object3D[]): THREE.Vector3 {
    if (objects.length === 0) {
      return new THREE.Vector3(0, 0, 0);
    }
    if (objects.length === 1) {
      const sole = objects[0]!;
      sole.updateMatrixWorld(true);
      return sole.getWorldPosition(new THREE.Vector3());
    }
    objects.forEach((object) => object.updateMatrixWorld(true));
    this.boundingBox.setFromObject(objects[0]!);
    objects.slice(1).forEach((object) => {
      this.boundingBox.expandByObject(object);
    });
    return this.boundingBox.getCenter(new THREE.Vector3());
  }

  /**
   * Returns the grid snap configuration.
   *
   * @returns The GridSnap instance.
   */
  getGridSnap(): GridSnap {
    return this.gridSnap;
  }

  /**
   * Rotates a single object around a pivot and updates its orientation.
   *
   * @param object The object to rotate.
   * @param pivot The rotation pivot.
   * @param rotationQuaternion The rotation to apply.
   */
  private rotateObjectAroundPivot(
    object: THREE.Object3D,
    pivot: THREE.Vector3,
    rotationQuaternion: THREE.Quaternion,
  ): void {
    const relativePos = object.position.clone().sub(pivot);
    relativePos.applyQuaternion(rotationQuaternion);
    object.position.copy(relativePos.add(pivot));
    object.quaternion.premultiply(rotationQuaternion);
  }

  /**
   * Restores rotation from initial state plus total rotation quaternion.
   *
   * @param object The object to update.
   * @param initialPositions Pre-drag positions.
   * @param initialQuaternions Pre-drag quaternions.
   * @param pivot The rotation pivot.
   * @param rotationQuaternion The total rotation from drag start.
   */
  private applyAbsoluteRotationToObject(
    object: THREE.Object3D,
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>,
    pivot: THREE.Vector3,
    rotationQuaternion: THREE.Quaternion,
  ): void {
    const startLocalPosition = initialPositions.get(object);
    const startLocalQuaternion = initialQuaternions.get(object);
    if (!startLocalPosition || !startLocalQuaternion) {
      return;
    }
    this.applyWorldSpaceAbsoluteRotation(object, startLocalPosition, startLocalQuaternion, pivot, rotationQuaternion);
  }

  /**
   * Applies a world-space rotation around a world pivot, then writes local TRS.
   * Required for solid brushes under transformed solid roots so the green hull
   * and CSG pose stay locked to the same transform.
   *
   * @param object Object to update.
   * @param startLocalPosition Pre-drag local position.
   * @param startLocalQuaternion Pre-drag local quaternion.
   * @param worldPivot World-space rotation pivot.
   * @param worldRotationQuaternion World-space rotation from drag start.
   */
  private applyWorldSpaceAbsoluteRotation(
    object: THREE.Object3D,
    startLocalPosition: THREE.Vector3,
    startLocalQuaternion: THREE.Quaternion,
    worldPivot: THREE.Vector3,
    worldRotationQuaternion: THREE.Quaternion,
  ): void {
    const parent = object.parent;
    if (!parent) {
      this.applyRootLevelAbsoluteRotation(
        object,
        startLocalPosition,
        startLocalQuaternion,
        worldPivot,
        worldRotationQuaternion,
      );
      return;
    }
    parent.updateMatrixWorld(true);
    const parentWorldQuaternion = new THREE.Quaternion();
    parent.getWorldQuaternion(parentWorldQuaternion);
    const startWorldPosition = startLocalPosition.clone().applyMatrix4(parent.matrixWorld);
    const startWorldQuaternion = parentWorldQuaternion.clone().multiply(startLocalQuaternion);
    const rotatedWorldPosition = startWorldPosition
      .clone()
      .sub(worldPivot)
      .applyQuaternion(worldRotationQuaternion)
      .add(worldPivot);
    const rotatedWorldQuaternion = worldRotationQuaternion.clone().multiply(startWorldQuaternion);
    const parentInverse = parent.matrixWorld.clone().invert();
    object.position.copy(rotatedWorldPosition).applyMatrix4(parentInverse);
    object.quaternion.copy(parentWorldQuaternion.clone().invert().multiply(rotatedWorldQuaternion));
    object.updateMatrixWorld(true);
  }

  /**
   * Applies absolute rotation when the object has no parent (world equals
   * local).
   *
   * @param object Object to update.
   * @param startPosition Pre-drag position.
   * @param startQuaternion Pre-drag quaternion.
   * @param worldPivot World pivot.
   * @param worldRotationQuaternion World rotation from drag start.
   */
  private applyRootLevelAbsoluteRotation(
    object: THREE.Object3D,
    startPosition: THREE.Vector3,
    startQuaternion: THREE.Quaternion,
    worldPivot: THREE.Vector3,
    worldRotationQuaternion: THREE.Quaternion,
  ): void {
    const relativePosition = startPosition.clone().sub(worldPivot);
    relativePosition.applyQuaternion(worldRotationQuaternion);
    object.position.copy(relativePosition.add(worldPivot));
    object.quaternion.copy(worldRotationQuaternion).multiply(startQuaternion);
    object.updateMatrixWorld(true);
  }

  /**
   * Scales an object along an axis and moves it relative to the pivot.
   *
   * @param object The object to scale.
   * @param pivot The scale pivot.
   * @param axis The normalized scale axis.
   * @param factor The multiplicative factor for this step.
   */
  private scaleObjectAlongAxis(
    object: THREE.Object3D,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number,
  ): void {
    const relativePos = object.position.clone().sub(pivot);
    const projection = relativePos.dot(axis);
    const scaledRelative = relativePos
      .clone()
      .sub(axis.clone().multiplyScalar(projection))
      .add(axis.clone().multiplyScalar(projection * factor));
    object.position.copy(scaledRelative.add(pivot));
    const absX = Math.abs(axis.x);
    const absY = Math.abs(axis.y);
    const absZ = Math.abs(axis.z);
    let gizmoAxis = GizmoAxis.Z;
    if (absX >= absY && absX >= absZ) gizmoAxis = GizmoAxis.X;
    else if (absY >= absX && absY >= absZ) gizmoAxis = GizmoAxis.Y;
    this.multiplyLocalScaleComponent(object.scale, gizmoAxis, factor);
  }

  /**
   * Restores scale from initial state plus total factor along an axis.
   *
   * @param object The object to update.
   * @param initialPositions Pre-drag positions.
   * @param initialScales Pre-drag scales.
   * @param pivot The scale pivot.
   * @param axis The normalized world-space scale axis.
   * @param totalFactor The total scale factor from drag start.
   * @param gizmoAxis Local scale component controlled by the handle.
   */
  private applyAbsoluteScaleToObject(
    object: THREE.Object3D,
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    totalFactor: number,
    gizmoAxis: GizmoAxis,
  ): void {
    const startPos = initialPositions.get(object);
    const startScale = initialScales.get(object);
    if (!startPos || !startScale) return;
    const relativePos = startPos.clone().sub(pivot);
    const projection = relativePos.dot(axis);
    const scaledRelative = relativePos
      .clone()
      .sub(axis.clone().multiplyScalar(projection))
      .add(axis.clone().multiplyScalar(projection * totalFactor));
    object.position.copy(scaledRelative.add(pivot));
    object.scale.copy(startScale);
    this.multiplyLocalScaleComponent(object.scale, gizmoAxis, totalFactor);
  }

  /**
   * Free ScaleAroundPivot in world space, then writes local TRS.
   *
   * @param object Object to update.
   * @param initialPositions Pre-drag local positions.
   * @param initialScales Pre-drag local scales.
   * @param worldPivot World-space pivot.
   * @param axisFactors Snapped per-axis scale factors.
   */
  private applyAbsoluteFreeScaleToObject(
    object: THREE.Object3D,
    initialPositions: Map<THREE.Object3D, THREE.Vector3>,
    initialScales: Map<THREE.Object3D, THREE.Vector3>,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    const startLocalPosition = initialPositions.get(object);
    const startScale = initialScales.get(object);
    if (!startLocalPosition || !startScale) {
      return;
    }
    this.writeFreeScaledLocalPose(object, startLocalPosition, startScale, worldPivot, axisFactors);
  }

  /**
   * Writes local position and free scale from a world-space ScaleAroundPivot.
   *
   * @param object Object to update.
   * @param startLocalPosition Pre-drag local position.
   * @param startScale Pre-drag local scale.
   * @param worldPivot World-space pivot.
   * @param axisFactors Per-axis scale factors.
   */
  private writeFreeScaledLocalPose(
    object: THREE.Object3D,
    startLocalPosition: THREE.Vector3,
    startScale: THREE.Vector3,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    if (!object.parent) {
      this.writeRootFreeScaledPose(object, startLocalPosition, startScale, worldPivot, axisFactors);
      return;
    }
    this.writeChildFreeScaledPose(object, startLocalPosition, startScale, worldPivot, axisFactors);
  }

  /**
   * Free scale when the object has no parent (world equals local).
   *
   * @param object Object to update.
   * @param startPosition Pre-drag position.
   * @param startScale Pre-drag scale.
   * @param worldPivot World pivot.
   * @param axisFactors Per-axis scale factors.
   */
  private writeRootFreeScaledPose(
    object: THREE.Object3D,
    startPosition: THREE.Vector3,
    startScale: THREE.Vector3,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    object.position.copy(
      TransformConstraint.scalePointAroundPivot(startPosition, worldPivot, axisFactors.x, axisFactors.y, axisFactors.z),
    );
    this.writeFreeLocalScale(object, startScale, axisFactors);
    object.updateMatrixWorld(true);
  }

  /**
   * Free scale for a child object under a transformed parent.
   *
   * @param object Object to update.
   * @param startLocalPosition Pre-drag local position.
   * @param startScale Pre-drag local scale.
   * @param worldPivot World pivot.
   * @param axisFactors Per-axis scale factors.
   */
  private writeChildFreeScaledPose(
    object: THREE.Object3D,
    startLocalPosition: THREE.Vector3,
    startScale: THREE.Vector3,
    worldPivot: THREE.Vector3,
    axisFactors: THREE.Vector3,
  ): void {
    const parent = object.parent;
    if (!parent) {
      return;
    }
    parent.updateMatrixWorld(true);
    const startWorldPosition = startLocalPosition.clone().applyMatrix4(parent.matrixWorld);
    const scaledWorldPosition = TransformConstraint.scalePointAroundPivot(
      startWorldPosition,
      worldPivot,
      axisFactors.x,
      axisFactors.y,
      axisFactors.z,
    );
    object.position.copy(scaledWorldPosition).applyMatrix4(parent.matrixWorld.clone().invert());
    this.writeFreeLocalScale(object, startScale, axisFactors);
    object.updateMatrixWorld(true);
  }

  /**
   * Multiplies local scale components by per-axis free-scale factors.
   *
   * @param object Object whose scale is written.
   * @param startScale Pre-drag local scale.
   * @param axisFactors Per-axis scale factors.
   */
  private writeFreeLocalScale(object: THREE.Object3D, startScale: THREE.Vector3, axisFactors: THREE.Vector3): void {
    object.scale.set(
      Math.max(0.01, startScale.x * axisFactors.x),
      Math.max(0.01, startScale.y * axisFactors.y),
      Math.max(0.01, startScale.z * axisFactors.z),
    );
  }

  /**
   * Multiplies one local scale component for a primary gizmo axis handle.
   *
   * @param scale The scale vector to modify in place.
   * @param gizmoAxis Handle axis (X/Y/Z).
   * @param factor The multiplicative scale factor.
   */
  private multiplyLocalScaleComponent(scale: THREE.Vector3, gizmoAxis: GizmoAxis, factor: number): void {
    if (gizmoAxis === GizmoAxis.X) {
      scale.x = Math.max(0.01, scale.x * factor);
      return;
    }
    if (gizmoAxis === GizmoAxis.Y) {
      scale.y = Math.max(0.01, scale.y * factor);
      return;
    }
    if (gizmoAxis === GizmoAxis.Z) {
      scale.z = Math.max(0.01, scale.z * factor);
      return;
    }
    scale.x = Math.max(0.01, scale.x * factor);
    scale.y = Math.max(0.01, scale.y * factor);
    scale.z = Math.max(0.01, scale.z * factor);
  }
}
