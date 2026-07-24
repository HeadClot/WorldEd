import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GlbExporter } from '../../src/io/glb_exporter.js';
import { buildExportScene } from '../../src/io/export_scene_builder.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';

/** GLB file format magic number (little-endian 'glTF'). */
const GLB_MAGIC_NUMBER = 0x46546c67;

describe('GlbExporter', () => {
  let worldGroup: THREE.Group;
  let exporter: GlbExporter;

  beforeEach(() => {
    worldGroup = new THREE.Group();
    exporter = new GlbExporter();
  });

  it('should produce non-empty ArrayBuffer for a single mesh', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    worldGroup.add(mesh);
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should produce valid GLB header for empty group', async () => {
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    expect(magic).toBe(GLB_MAGIC_NUMBER);
  });

  it('should produce larger buffer for multiple meshes', async () => {
    const mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    const mesh2 = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    const mesh3 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1, 2, 32),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    worldGroup.add(mesh1);
    worldGroup.add(mesh2);
    worldGroup.add(mesh3);
    const buffer = await exporter.export(worldGroup);
    expect(buffer.byteLength).toBeGreaterThan(100);
  });

  it('should export scene with groups as valid binary', async () => {
    const group = new THREE.Group();
    group.name = 'TestGroup';
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    group.add(mesh);
    worldGroup.add(group);
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    expect(magic).toBe(GLB_MAGIC_NUMBER);
  });

  it('should export plane geometry correctly', async () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    worldGroup.add(mesh);
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should export solid models without brush hulls as valid GLB', async () => {
    const model = new SolidModel('GlbSolid');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Subtractive);
    worldGroup.add(model.root);
    const liveBrushCount = model.root.children.filter((child) =>
      SolidBrushVisual.isBrushObject(child),
    ).length;
    expect(liveBrushCount).toBeGreaterThanOrEqual(2);
    const filtered = buildExportScene(worldGroup);
    const exportMeshes: THREE.Mesh[] = [];
    filtered.traverse((obj) => {
      if (obj instanceof THREE.Mesh) exportMeshes.push(obj);
    });
    expect(exportMeshes.length).toBe(1);
    expect(SolidBrushVisual.isBrushObject(exportMeshes[0])).toBe(false);
    const buffer = await exporter.export(worldGroup);
    expect(buffer.byteLength).toBeGreaterThan(0);
    const view = new DataView(buffer);
    expect(view.getUint32(0, true)).toBe(GLB_MAGIC_NUMBER);
  });
});
