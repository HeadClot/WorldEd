import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { transferSurfacesByPlaneMatch } from '@/solid/brush/solid_brush_surface_transfer.js';
import { createFaceSurfaceFromTileSize } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

describe('solid_brush_surface_transfer', () => {
  it('matches coplanar faces and leaves cap faces with new defaults', () => {
    const source = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const sideIndex = source.planes.findIndex((plane) => plane.normal.z > 0.9);
    const custom = createFaceSurfaceFromTileSize(source.planes[sideIndex!]!.normal, 'side.png', 2, 1);
    custom.uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0.1, 0), source.planes[sideIndex!]!.normal, 0, 0.5, 1);
    const faceSurfaces = source.faces.map((_, index) =>
      index === sideIndex ? custom : createFaceSurfaceFromTileSize(source.planes[index!]!.normal, 'default.png'),
    );
    // Keep y <= 0.25; side planes (constant z) survive, new cap appears at y=0.25.
    const clipPlane = new SolidPlane(new THREE.Vector3(0, 1, 0), -0.25);
    const clipped = SolidBrushPlaneClip.clipKeepInside(source, clipPlane);
    expect(clipped).not.toBeNull();
    const transferred = transferSurfacesByPlaneMatch(
      source,
      createFaceSurfaceFromTileSize(new THREE.Vector3(0, 1, 0), 'default.png'),
      faceSurfaces,
      clipped!,
    );
    const newSide = clipped!.planes.findIndex((plane) => plane.normal.z > 0.9);
    expect(newSide).toBeGreaterThanOrEqual(0);
    expect(transferred.faceSurfaces[newSide]?.textureId).toBe('side.png');
    expect(transferred.faceSurfaces[newSide]?.uv.equals(custom.uv, 1e-5)).toBe(true);
    const capIndex = clipped!.planes.findIndex(
      (plane) => !source.planes.some((sourcePlane) => sourcePlane.isAlignedWith(plane)),
    );
    expect(capIndex).toBeGreaterThanOrEqual(0);
    expect(transferred.faceSurfaces[capIndex]?.textureId).toBe('default.png');
  });
});
