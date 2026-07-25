import * as THREE from 'three';
import { FaceTextureMapping, withTrsAccessors } from '../../texture/uv/face_texture_mapping.js';
import { SurfaceUvMatrix } from '../../texture/uv_matrix/surface_uv_matrix.js';
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
 * Converts Hammer U/V axes into a face texture mapping with a SurfaceUvMatrix.
 * Hammer: u = (dot(pos, axis) / scale + translation) / textureSize. Matrix: u =
 * U·pos + Uw with U = axis_dir / (texSize * scale * unit).
 */
export class VmfUvConverter {
  /**
   * Builds a face mapping from one side's U/V axes and material name.
   *
   * @param materialName VMF material path.
   * @param uAxis Hammer U axis.
   * @param vAxis Hammer V axis.
   * @param _faceNormal Reserved.
   * @param textureWidth Assumed texture width in texels.
   * @param textureHeight Assumed texture height in texels.
   * @param unitScale Inches to meters.
   * @returns Face texture mapping with UV matrix.
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
    void _faceNormal;
    const metersPerTileU = this.axisToMetersPerTile(uAxis, textureWidth, unitScale);
    const metersPerTileV = this.axisToMetersPerTile(vAxis, textureHeight, unitScale);
    const worldU = this.swizzleAxisDirection(uAxis);
    const worldV = this.swizzleAxisDirection(vAxis).multiplyScalar(-1);
    const matrixScaleU = 1 / metersPerTileU;
    const matrixScaleV = 1 / metersPerTileV;
    const offsetMetersU = this.axisToMeterOffset(uAxis, unitScale);
    const offsetMetersV = -this.axisToMeterOffset(vAxis, unitScale);
    const u = new THREE.Vector4(
      worldU.x * matrixScaleU,
      worldU.y * matrixScaleU,
      worldU.z * matrixScaleU,
      -offsetMetersU * matrixScaleU,
    );
    const v = new THREE.Vector4(
      worldV.x * matrixScaleV,
      worldV.y * matrixScaleV,
      worldV.z * matrixScaleV,
      -offsetMetersV * matrixScaleV,
    );
    return withTrsAccessors({
      textureId: materialNameToTextureId(materialName),
      uv: new SurfaceUvMatrix(u, v),
      align: 'face',
    });
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
   * World meters covered by one full texture tile along a VMF axis.
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
   * Converts Hammer texel translation into a meter offset.
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
