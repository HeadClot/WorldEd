import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDefaultPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import {
  adaptiveProjectedGridLineColor,
  distanceToNearestProjectedGridLine,
  evaluateProjectedGridLineMask,
  pickProjectedGridUvAxes,
  projectGridLocalToCellUv,
  projectedGridGrazingFade,
  projectedGridLayerScreenFade,
  worldDirectionToGridLocal,
  worldPointToGridLocal,
} from '@/viewports/grid/projected/projected_grid_math.js';

describe('projected_grid_math', () => {
  it('maps world points into the default grid frame along U V and normal', () => {
    const frame = buildDefaultPlaneFrame();
    const local = worldPointToGridLocal(new THREE.Vector3(2, 3, 4), frame);
    expect(local.x).toBeCloseTo(2);
    expect(local.y).toBeCloseTo(4);
    expect(local.z).toBeCloseTo(3);
  });

  it('maps world directions into a yawed grid frame', () => {
    const yaw = Math.PI / 2;
    const frame = {
      origin: new THREE.Vector3(),
      uAxis: new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)),
      vAxis: new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw)),
      normal: new THREE.Vector3(0, 1, 0),
    };
    const local = worldDirectionToGridLocal(new THREE.Vector3(1, 0, 0), frame);
    expect(local.x).toBeCloseTo(0);
    expect(local.y).toBeCloseTo(-1);
    expect(local.z).toBeCloseTo(0);
  });

  it('picks UV axes from the dominant local normal component', () => {
    expect(pickProjectedGridUvAxes(new THREE.Vector3(1, 0, 0))).toEqual([2, 1]);
    expect(pickProjectedGridUvAxes(new THREE.Vector3(0, 1, 0))).toEqual([0, 2]);
    expect(pickProjectedGridUvAxes(new THREE.Vector3(0, 0, 1))).toEqual([0, 1]);
  });

  it('projects local points into cell-space UV for the chosen face axes', () => {
    const uv = projectGridLocalToCellUv(new THREE.Vector3(1, 2, 3), [0, 1], 0.5);
    expect(uv.x).toBeCloseTo(2);
    expect(uv.y).toBeCloseTo(4);
  });

  it('returns a strong line mask on lattice centers and weak mid-cell values', () => {
    const onLine = evaluateProjectedGridLineMask(new THREE.Vector2(0, 0.25), new THREE.Vector2(0.02, 0.02), 1);
    const midCell = evaluateProjectedGridLineMask(new THREE.Vector2(0.25, 0.25), new THREE.Vector2(0.02, 0.02), 1);
    expect(onLine).toBeGreaterThan(0.5);
    expect(midCell).toBeLessThan(0.1);
  });

  it('uses a soft hairline falloff without a thick filled core', () => {
    const onLine = evaluateProjectedGridLineMask(new THREE.Vector2(0, 0.25), new THREE.Vector2(0.03, 0.03), 1);
    const nearEdge = evaluateProjectedGridLineMask(new THREE.Vector2(0.02, 0.25), new THREE.Vector2(0.03, 0.03), 1);
    expect(onLine).toBeGreaterThan(0.85);
    expect(nearEdge).toBeLessThan(onLine);
    expect(nearEdge).toBeLessThan(0.5);
  });

  it('keeps stable distance to lines at large exact grid coordinates', () => {
    expect(distanceToNearestProjectedGridLine(-130, 1)).toBeCloseTo(0, 6);
    expect(distanceToNearestProjectedGridLine(-6, 1)).toBeCloseTo(0, 6);
    expect(distanceToNearestProjectedGridLine(-130, 0.25)).toBeCloseTo(0, 6);
    expect(distanceToNearestProjectedGridLine(-129.75, 0.25)).toBeCloseTo(0, 6);
    expect(distanceToNearestProjectedGridLine(-129.875, 0.25)).toBeCloseTo(0.125, 5);
  });

  it('stays on-line for large coordinates without fract cell-index noise', () => {
    const largeOnLine = evaluateProjectedGridLineMask(new THREE.Vector2(-130, 12.5), new THREE.Vector2(0.02, 0.02), 1);
    const largeMid = evaluateProjectedGridLineMask(new THREE.Vector2(-129.5, 12.5), new THREE.Vector2(0.02, 0.02), 1);
    expect(largeOnLine).toBeGreaterThan(0.85);
    expect(largeMid).toBeLessThan(0.15);
  });

  it('stays on-line at the world origin axes', () => {
    expect(distanceToNearestProjectedGridLine(0, 1)).toBeCloseTo(0, 6);
    expect(distanceToNearestProjectedGridLine(0, 0.25)).toBeCloseTo(0, 6);
    expect(distanceToNearestProjectedGridLine(1e-8, 1)).toBeLessThan(1e-6);
    expect(distanceToNearestProjectedGridLine(-1e-8, 1)).toBeLessThan(1e-6);
  });

  it('picks light lattice strokes on dark surfaces and dark strokes on light ones', () => {
    const theme = new THREE.Color(0x3a3a3a);
    const onDark = adaptiveProjectedGridLineColor(new THREE.Color(0x1a1a1a), theme);
    const onLight = adaptiveProjectedGridLineColor(new THREE.Color(0xe0e0e0), theme);
    const darkLuma = onDark.r * 0.2126 + onDark.g * 0.7152 + onDark.b * 0.0722;
    const lightLuma = onLight.r * 0.2126 + onLight.g * 0.7152 + onLight.b * 0.0722;
    expect(darkLuma).toBeGreaterThan(0.45);
    expect(lightLuma).toBeLessThan(0.35);
    expect(darkLuma).toBeGreaterThan(lightLuma);
  });

  it('fades lattice layers when fewer screen pixels cover a period', () => {
    expect(projectedGridLayerScreenFade(1.0, 2.5, 6.0)).toBeCloseTo(0, 5);
    expect(projectedGridLayerScreenFade(8.0, 2.5, 6.0)).toBeCloseTo(1, 5);
    expect(projectedGridLayerScreenFade(4.0, 2.5, 6.0)).toBeGreaterThan(0.2);
    expect(projectedGridLayerScreenFade(4.0, 2.5, 6.0)).toBeLessThan(0.8);
  });

  it('fades lattice on grazing views and keeps it head-on', () => {
    expect(projectedGridGrazingFade(0.02)).toBeCloseTo(0, 5);
    expect(projectedGridGrazingFade(0.5)).toBeCloseTo(1, 5);
    expect(projectedGridGrazingFade(0.12)).toBeGreaterThan(0.1);
    expect(projectedGridGrazingFade(0.12)).toBeLessThan(0.9);
  });
});
