import * as THREE from 'three';
import { FaceTextureMapping, createDefaultFaceTextureMapping } from '../../texture/uv/face_texture_mapping.js';
import { VMF_INCHES_TO_METERS, swizzleSourceComponentsToThree } from './vmf_coordinates.js';
import { VmfTextureAxis } from './vmf_types.js';
import { materialNameToTextureId } from './vmf_material_policy.js';

/**
 * Default texture size used when VMT/VTF dimensions are unknown. Half-Life 2
 * materials are commonly 512²; UV phase remains correct for any power-of-two
 * size that matches the eventual loaded texture.
 */
export const VMF_DEFAULT_TEXTURE_SIZE = 512;

/**
 * Converts Hammer U/V axes into a face texture mapping. Stores exact swizzled
 * world axes for Source-accurate projection, plus scale and offset in the
 * editor's meters-per-tile / meter-offset convention. V is flipped so Source
 * material orientation matches the editor projector.
 */
export class VmfUvConverter {
  /**
   * Builds a face mapping from one side's U/V axes and material name.
   *
   * @param materialName VMF material path.
   * @param uAxis Hammer U axis.
   * @param vAxis Hammer V axis.
   * @param _faceNormal Reserved (kept for call-site compatibility).
   * @param textureWidth Assumed texture width in texels.
   * @param textureHeight Assumed texture height in texels.
   * @param unitScale Inches to meters.
   * @returns Face texture mapping for the solid brush face.
   */
  convertSideMapping(
    materialName: string,
    uAxis: VmfTextureAxis,
    vAxis: VmfTextureAxis,
    _faceNormal: THREE.Vector3,
    textureWidth: number = VMF_DEFAULT_TEXTURE_SIZE,
    textureHeight: number = VMF_DEFAULT_TEXTURE_SIZE,
    unitScale: number = VMF_INCHES_TO_METERS,
  ): FaceTextureMapping {
    const mapping = createDefaultFaceTextureMapping(materialNameToTextureId(materialName));
    mapping.align = 'face';
    mapping.rotationDeg = 0;
    const worldU = this.swizzleAxisDirection(uAxis);
    const worldV = this.swizzleAxisDirection(vAxis);
    worldV.multiplyScalar(-1);
    mapping.customUAxis = { x: worldU.x, y: worldU.y, z: worldU.z };
    mapping.customVAxis = { x: worldV.x, y: worldV.y, z: worldV.z };
    mapping.scaleU = this.axisToMetersPerTile(uAxis, textureWidth, unitScale);
    mapping.scaleV = this.axisToMetersPerTile(vAxis, textureHeight, unitScale);
    mapping.offsetU = this.axisToMeterOffset(uAxis, unitScale);
    mapping.offsetV = -this.axisToMeterOffset(vAxis, unitScale);
    return mapping;
  }

  /**
   * Swizzles a Hammer axis direction into editor Y-up and normalizes it.
   *
   * @param axis Hammer texture axis.
   * @returns Unit direction in editor space, or zero when degenerate.
   */
  private swizzleAxisDirection(axis: VmfTextureAxis): THREE.Vector3 {
    const direction = swizzleSourceComponentsToThree(axis.x, axis.y, axis.z);
    if (direction.lengthSq() < 1e-12) {
      return new THREE.Vector3(0, 0, 0);
    }
    return direction.normalize();
  }

  /**
   * World meters covered by one full texture tile along a VMF axis. Hammer: u =
   * (dot(pos_in, axis) / scale + translation) / textureSize. In meters: scaleU
   * = textureSize * scale * unitScale.
   *
   * @param axis Hammer texture axis.
   * @param textureSize Texels along that UV dimension.
   * @param unitScale Inches to meters.
   * @returns Positive scale in meters per tile.
   */
  private axisToMetersPerTile(axis: VmfTextureAxis, textureSize: number, unitScale: number): number {
    const scale = axis.scale === 0 ? 0.25 : Math.abs(axis.scale);
    const meters = textureSize * scale * unitScale;
    return meters > 1e-8 ? meters : 1;
  }

  /**
   * Converts Hammer texel translation into a meter offset for
   * projectWorldPositionToUv. With u = (dot(pos, û) - offsetU) / scaleU and
   * scaleU = texSize * scale * unit, offsetU = -translation * scale * unitScale
   * matches Hammer phase.
   *
   * @param axis Hammer texture axis.
   * @param unitScale Inches to meters.
   * @returns Offset in meters.
   */
  private axisToMeterOffset(axis: VmfTextureAxis, unitScale: number): number {
    const scale = axis.scale === 0 ? 0.25 : axis.scale;
    return -axis.translation * scale * unitScale;
  }
}
