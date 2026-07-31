import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidBrushClip } from '@/solid/commands/brush/command_solid_brush_clip.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { createFaceTextureMappingFromTrs } from '@/texture/uv/face_texture_mapping.js';

/** Unit tests for solid brush plane clipping used by the clip tool. */
describe('SolidBrushPlaneClip', () => {
  it('clips a unit box keeping the positive X half as a valid solid', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const clipped = SolidBrushPlaneClip.clipKeepInside(brush, plane);
    expect(clipped).not.toBeNull();
    const validation = SolidBrushValidator.validate(clipped!);
    expect(validation.valid, validation.errors.join('; ')).toBe(true);
    const bounds = clipped!.computeLocalBounds();
    expect(bounds.max.x).toBeCloseTo(0, 3);
    expect(bounds.min.x).toBeCloseTo(-1, 3);
  });

  it('clips a solid brush in a solid model via command', () => {
    const model = new SolidModel('ClipBrushModel');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    expect(instance.mesh).toBeTruthy();
    expect(SolidBrushVisual.isBrushObject(instance.mesh!)).toBe(true);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const command = new CommandSolidBrushClip(model, instance.id, plane, false);
    command.execute();
    expect(command.didClip()).toBe(true);
    const updated = model.findBrush(instance.id);
    expect(updated).toBeTruthy();
    const validation = SolidBrushValidator.validate(updated!.brush);
    expect(validation.valid).toBe(true);
    const bounds = updated!.brush.computeLocalBounds();
    expect(bounds.max.x).toBeLessThanOrEqual(0.01);
  });

  it('preserves authored UV matrix on surviving faces after clip', () => {
    const model = new SolidModel('ClipUvPreserve');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    // Author a distinctive UV scale on a side face (+Z); clip removes the top
    // but coplanar side planes must keep their UV matrices.
    const sideIndex = instance.brush.planes.findIndex((plane) => plane.normal.z > 0.9);
    expect(sideIndex).toBeGreaterThanOrEqual(0);
    instance.setFaceMapping(
      sideIndex,
      createFaceTextureMappingFromTrs(
        'clip-uv.png',
        instance.faceNormalLocal(sideIndex),
        { scaleU: 2, scaleV: 1, offsetU: 0.25, offsetV: 0, rotationDeg: 0 },
        'face',
      ),
    );
    const beforeUv = instance.getFaceSurface(sideIndex).uv.clone();
    // Clip from above (keep lower half) — side plane equations stay the same.
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.25);
    const command = new CommandSolidBrushClip(model, instance.id, plane, true);
    command.execute();
    expect(command.didClip()).toBe(true);
    const updated = model.findBrush(instance.id)!;
    const newSideIndex = updated.brush.planes.findIndex((p) => p.normal.z > 0.9);
    expect(newSideIndex).toBeGreaterThanOrEqual(0);
    const afterSurface = updated.getFaceSurface(newSideIndex);
    expect(afterSurface.textureId).toBe('clip-uv.png');
    expect(afterSurface.uv.equals(beforeUv, 1e-5)).toBe(true);
  });
});
