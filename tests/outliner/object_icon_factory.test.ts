import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ObjectIconFactory } from '../../src/ui/outliner/object_icon_factory.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';
import { markAsSolidCsgGroup, setSolidGroupOperation } from '../../src/solid/model/solid_group.js';

describe('ObjectIconFactory.getIcon', () => {
  it('should return group icon for THREE.Group', () => {
    const group = new THREE.Group();
    const icon = ObjectIconFactory.getIcon(group);
    expect(icon.character).toBe('📁');
    expect(icon.color).toBe('#e67e22');
    expect(icon.badgeCharacter).toBeUndefined();
  });

  it('should return green/red/blue CSS dots for solid brush operations', () => {
    const additive = SolidBrushVisual.createBoxPreview('Add', 2, SolidOperation.Additive);
    const subtractive = SolidBrushVisual.createBoxPreview('Sub', 2, SolidOperation.Subtractive);
    const intersecting = SolidBrushVisual.createBoxPreview('Int', 2, SolidOperation.Intersecting);
    expect(ObjectIconFactory.getIcon(additive)).toEqual({
      character: '',
      color: '#27ae60',
      cssDot: true,
      cssDotNudgeYPx: 0,
    });
    expect(ObjectIconFactory.getIcon(subtractive)).toEqual({
      character: '',
      color: '#c0392b',
      cssDot: true,
      cssDotNudgeYPx: 1,
    });
    expect(ObjectIconFactory.getIcon(intersecting)).toEqual({
      character: '',
      color: '#2980b9',
      cssDot: true,
      cssDotNudgeYPx: 0,
    });
  });

  it('should keep yellow folder for additive solid CSG groups', () => {
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    const icon = ObjectIconFactory.getIcon(group);
    expect(icon.character).toBe('📁');
    expect(icon.color).toBe('#e67e22');
    expect(icon.badgeCharacter).toBeUndefined();
  });

  it('should badge solid CSG folders with red or blue for non-additive ops', () => {
    const subtractive = new THREE.Group();
    markAsSolidCsgGroup(subtractive, SolidOperation.Subtractive);
    const intersecting = new THREE.Group();
    markAsSolidCsgGroup(intersecting, SolidOperation.Intersecting);
    expect(ObjectIconFactory.getIcon(subtractive)).toEqual({
      character: '📁',
      color: '#e67e22',
      badgeCssDot: true,
      badgeColor: '#c0392b',
    });
    expect(ObjectIconFactory.getIcon(intersecting)).toEqual({
      character: '📁',
      color: '#e67e22',
      badgeCssDot: true,
      badgeColor: '#2980b9',
    });
    setSolidGroupOperation(subtractive, SolidOperation.Additive);
    expect(ObjectIconFactory.getIcon(subtractive).badgeCssDot).toBeUndefined();
  });

  it('should return solid model root icon', () => {
    const model = new SolidModel('IconSolid');
    const icon = ObjectIconFactory.getIcon(model.root);
    expect(icon.character).toBe('▣');
    expect(icon.color).toBe('#e86a17');
  });

  it('should return box icon for BoxGeometry mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('◼');
    expect(icon.color).toBe('#3498db');
  });

  it('should return sphere icon for SphereGeometry mesh', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('●');
    expect(icon.color).toBe('#2ecc71');
  });

  it('should return plane icon for PlaneGeometry mesh', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('▭');
    expect(icon.color).toBe('#9b59b6');
  });

  it('should return cylinder icon for CylinderGeometry mesh', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshBasicMaterial());
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('⬡');
    expect(icon.color).toBe('#1abc9c');
  });

  it('should return generic mesh icon for unknown geometry', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('◇');
    expect(icon.color).toBe('#95a5a6');
  });

  it('should return directional light icon', () => {
    const light = new THREE.DirectionalLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('☀');
    expect(icon.color).toBe('#f39c12');
  });

  it('should return point light icon', () => {
    const light = new THREE.PointLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('✦');
    expect(icon.color).toBe('#f1c40f');
  });

  it('should return spot light icon', () => {
    const light = new THREE.SpotLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('◎');
    expect(icon.color).toBe('#e74c3c');
  });

  it('should return camera icon for camera object', () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const icon = ObjectIconFactory.getIcon(camera);
    expect(icon.character).toBe('📷');
    expect(icon.color).toBe('#e74c3c');
  });

  it('should return generic icon for Object3D', () => {
    const obj = new THREE.Object3D();
    const icon = ObjectIconFactory.getIcon(obj);
    expect(icon.character).toBe('○');
    expect(icon.color).toBe('#7f8c8d');
  });

  it('should return ambient light icon for AmbientLight', () => {
    const light = new THREE.AmbientLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('✧');
    expect(icon.color).toBe('#f1c40f');
  });
});
