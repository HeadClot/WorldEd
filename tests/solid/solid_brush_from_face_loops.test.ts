import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FactorySolidBrush } from '@/solid/brush/factory_solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Unit tests for arbitrary face-loop brush construction and hull previews. */
describe('SolidBrushFactory.createFromFaceLoops', () => {
  it('rebuilds a box from its own face loops and validates topology', () => {
    const width = 1.5 + Math.random();
    const height = 2 + Math.random();
    const depth = 3 + Math.random();
    const source = FactorySolidBrush.createCenteredBox(width, height, depth);
    const loops = source.faces.map((face) => source.getFaceVertices(face));
    const rebuilt = FactorySolidBrush.createFromFaceLoops(loops);
    expect(rebuilt).not.toBeNull();
    const validation = SolidBrushValidator.validate(rebuilt!);
    expect(validation.valid).toBe(true);
    expect(rebuilt!.faces.length).toBe(6);
    expect(rebuilt!.vertices.length).toBe(8);
    const bounds = rebuilt!.computeLocalBounds();
    expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(width, 4);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(height, 4);
    expect(bounds.getSize(new THREE.Vector3()).z).toBeCloseTo(depth, 4);
  });

  it('creates a hull preview mesh with triangle geometry', () => {
    const brush = FactorySolidBrush.createCenteredBox(2, 3, 4);
    const preview = SolidBrushVisual.createHullPreview('Hull', brush, SolidOperation.Additive);
    expect(SolidBrushVisual.isBrushObject(preview)).toBe(true);
    const position = preview.geometry.getAttribute('position');
    expect(position.count).toBeGreaterThanOrEqual(36);
    expect(SolidBrushVisual.isHullFillVisible(preview)).toBe(false);
    const material = preview.material as THREE.MeshBasicMaterial;
    expect(material.colorWrite).toBe(false);
    preview.geometry.dispose();
    if (preview.material instanceof THREE.Material) {
      preview.material.dispose();
    }
  });
});
