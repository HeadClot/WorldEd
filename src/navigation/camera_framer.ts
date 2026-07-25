import * as THREE from 'three';
import { BoundingVolumeComputer } from './bounding_volume_computer.js';
import { FrustumPlanes } from '../types/frustum_planes.js';
import { clampOrthoHalfExtent } from '../viewports/ortho_zoom_limits.js';

/**
 * Computes the target camera positions and frustums needed to frame objects.
 * Delegates actual animation to dedicated animator classes.
 */
export class CameraFramer {
  private boundingVolumeComputer: BoundingVolumeComputer;
  private readonly cornerScratch: THREE.Vector3[];
  private readonly scratchForward: THREE.Vector3;
  private readonly scratchRight: THREE.Vector3;
  private readonly scratchUp: THREE.Vector3;
  private readonly scratchOffset: THREE.Vector3;
  private readonly scratchLookAt: THREE.Vector3;

  /** Creates a new camera framer with a fresh bounding volume computer. */
  constructor() {
    this.boundingVolumeComputer = new BoundingVolumeComputer();
    this.cornerScratch = this.createCornerScratchVectors();
    this.scratchForward = new THREE.Vector3();
    this.scratchRight = new THREE.Vector3();
    this.scratchUp = new THREE.Vector3();
    this.scratchOffset = new THREE.Vector3();
    this.scratchLookAt = new THREE.Vector3();
  }

  /**
   * Allocates eight vectors used when projecting box corners into camera space.
   *
   * @returns An array of reusable corner vectors.
   */
  private createCornerScratchVectors(): THREE.Vector3[] {
    return Array.from({ length: 8 }, () => new THREE.Vector3());
  }

  /**
   * Computes a perspective fit that places the bounding box tightly in the
   * frustum. Uses the true AABB against vertical and horizontal FOV (not a
   * bounding sphere), so elongated selections are not massively over-zoomed.
   * Preserves the camera's current world view direction. Does not change near
   * or far clip planes.
   *
   * @param boundingBox World-space bounds of the objects to frame.
   * @param camera The perspective camera to position.
   * @param paddingFactor Multiplier on fit distance (1 = tight, 1.1 ≈ 10%).
   * @returns Target camera position and look-at point.
   */
  computePerspectiveTarget(
    boundingBox: THREE.Box3,
    camera: THREE.PerspectiveCamera,
    paddingFactor: number,
  ): { targetPosition: THREE.Vector3; targetLookAt: THREE.Vector3 } {
    boundingBox.getCenter(this.scratchLookAt);
    const targetLookAt = this.scratchLookAt.clone();
    this.buildViewBasis(camera);
    const distance = this.computePerspectiveFitDistance(boundingBox, targetLookAt, camera, paddingFactor);
    const targetPosition = targetLookAt.clone().addScaledVector(this.scratchForward, -distance);
    return { targetPosition, targetLookAt };
  }

  /**
   * Builds a camera-aligned right/up/forward basis from the current view.
   *
   * @param camera Perspective camera providing view direction and up.
   */
  private buildViewBasis(camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(this.scratchForward);
    this.scratchUp.copy(camera.up).normalize();
    this.scratchRight.crossVectors(this.scratchForward, this.scratchUp);
    if (this.scratchRight.lengthSq() < 1e-12) {
      this.scratchUp.set(0, 1, 0);
      this.scratchRight.crossVectors(this.scratchForward, this.scratchUp);
      if (this.scratchRight.lengthSq() < 1e-12) {
        this.scratchUp.set(1, 0, 0);
        this.scratchRight.crossVectors(this.scratchForward, this.scratchUp);
      }
    }
    this.scratchRight.normalize();
    this.scratchUp.crossVectors(this.scratchRight, this.scratchForward).normalize();
  }

  /**
   * Minimum distance from the look-at point so every box corner stays inside
   * the horizontal and vertical FOV cones, then applies padding.
   *
   * @param boundingBox Content bounds.
   * @param lookAt Framing look-at (box center).
   * @param camera Perspective camera for FOV and aspect.
   * @param paddingFactor Distance multiplier greater than or equal to 1.
   * @returns Distance from look-at to camera along the view axis.
   */
  private computePerspectiveFitDistance(
    boundingBox: THREE.Box3,
    lookAt: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    paddingFactor: number,
  ): number {
    const halfVFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const aspect = Math.max(camera.aspect, 1e-6);
    const tanV = Math.tan(halfVFov);
    const tanH = Math.tan(Math.atan(tanV * aspect));
    this.fillBoxCorners(boundingBox);
    let requiredDistance = 0.001;
    let minAlong = Infinity;
    this.cornerScratch.forEach((corner) => {
      this.scratchOffset.copy(corner).sub(lookAt);
      const along = this.scratchOffset.dot(this.scratchForward);
      const right = this.scratchOffset.dot(this.scratchRight);
      const up = this.scratchOffset.dot(this.scratchUp);
      minAlong = Math.min(minAlong, along);
      requiredDistance = Math.max(requiredDistance, Math.abs(right) / tanH - along);
      requiredDistance = Math.max(requiredDistance, Math.abs(up) / tanV - along);
    });
    requiredDistance = Math.max(requiredDistance, -minAlong + 0.05);
    return requiredDistance * Math.max(paddingFactor, 1);
  }

  /**
   * Computes the target orthographic frustum planes so that the bounding box
   * fits within the viewport with the given padding, in camera view space.
   * Preserves the current aspect ratio of the orthographic frustum.
   *
   * @param boundingBox The axis-aligned bounding box of target objects.
   * @param camera The orthographic camera to adjust.
   * @param paddingFactor The multiplier for extra space around the box.
   * @returns An object with left, right, top, and bottom frustum values.
   */
  computeOrthographicTarget(
    boundingBox: THREE.Box3,
    camera: THREE.OrthographicCamera,
    paddingFactor: number,
  ): FrustumPlanes {
    camera.updateMatrixWorld(true);
    const extents = this.computeViewSpaceExtents(boundingBox, camera);
    const paddedWidth = Math.max(extents.width * paddingFactor, 0.001);
    const paddedHeight = Math.max(extents.height * paddingFactor, 0.001);
    const aspect = this.computeFrustumAspect(camera);
    const sized = this.expandExtentsToAspect(paddedWidth, paddedHeight, aspect);
    const halfHeight = clampOrthoHalfExtent(sized.halfHeight);
    const halfWidth = halfHeight * aspect;
    return {
      left: extents.centerX - halfWidth,
      right: extents.centerX + halfWidth,
      top: extents.centerY + halfHeight,
      bottom: extents.centerY - halfHeight,
    };
  }

  /**
   * Projects a world-space bounding box into camera view space and measures it.
   *
   * @param boundingBox The world-space axis-aligned box.
   * @param camera The orthographic camera defining view space.
   * @returns Center and size of the projected extents in view X/Y.
   */
  private computeViewSpaceExtents(
    boundingBox: THREE.Box3,
    camera: THREE.OrthographicCamera,
  ): { centerX: number; centerY: number; width: number; height: number } {
    this.fillBoxCorners(boundingBox);
    const inverse = camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    this.cornerScratch.forEach((corner) => {
      corner.applyMatrix4(inverse);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    });
    return {
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Writes the eight corners of a bounding box into the scratch array.
   *
   * @param boundingBox The box whose corners are needed.
   */
  private fillBoxCorners(boundingBox: THREE.Box3): void {
    const min = boundingBox.min;
    const max = boundingBox.max;
    this.cornerScratch[0].set(min.x, min.y, min.z);
    this.cornerScratch[1].set(min.x, min.y, max.z);
    this.cornerScratch[2].set(min.x, max.y, min.z);
    this.cornerScratch[3].set(min.x, max.y, max.z);
    this.cornerScratch[4].set(max.x, min.y, min.z);
    this.cornerScratch[5].set(max.x, min.y, max.z);
    this.cornerScratch[6].set(max.x, max.y, min.z);
    this.cornerScratch[7].set(max.x, max.y, max.z);
  }

  /**
   * Reads the aspect ratio of the current orthographic frustum.
   *
   * @param camera The orthographic camera.
   * @returns Width over height, or 1 when the frustum is degenerate.
   */
  private computeFrustumAspect(camera: THREE.OrthographicCamera): number {
    const width = camera.right - camera.left;
    const height = camera.top - camera.bottom;
    if (height === 0) return 1;
    return width / height;
  }

  /**
   * Expands a content size so it fills the viewport without cropping, while
   * matching the given aspect ratio.
   *
   * @param contentWidth Content width in view space.
   * @param contentHeight Content height in view space.
   * @param aspect Desired frustum aspect ratio (width / height).
   * @returns Half-width and half-height for the final frustum.
   */
  private expandExtentsToAspect(
    contentWidth: number,
    contentHeight: number,
    aspect: number,
  ): { halfWidth: number; halfHeight: number } {
    let halfWidth = contentWidth * 0.5;
    let halfHeight = contentHeight * 0.5;
    const contentAspect = halfWidth / Math.max(halfHeight, 1e-12);
    if (contentAspect > aspect) {
      halfHeight = halfWidth / aspect;
    } else {
      halfWidth = halfHeight * aspect;
    }
    return { halfWidth, halfHeight };
  }
}
