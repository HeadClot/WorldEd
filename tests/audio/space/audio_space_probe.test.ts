import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AudioSpaceProbe } from '@/audio/space/audio_space_probe.js';
import { AUDIO_ROOM_CHARACTER_VOID, type AudioRoomCharacter } from '@/audio/space/audio_room_character.js';

describe('AudioSpaceProbe', () => {
  it('returns void character when unbound', () => {
    const probe = new AudioSpaceProbe();
    expect(probe.sampleRoomCharacter()).toBe(AUDIO_ROOM_CHARACTER_VOID);
  });

  it('returns void character when only empty space surrounds the origin', () => {
    const probe = new AudioSpaceProbe();
    probe.bind({
      getProbeOrigin: () => new THREE.Vector3(0, 0, 0),
      getSolidMeshes: () => [],
    });
    expect(probe.sampleRoomCharacter()).toBe(AUDIO_ROOM_CHARACTER_VOID);
  });

  it('detects nearby solid geometry as enclosed (not outdoor void)', () => {
    const wall = createBoxMesh(1, 4, 4, 1.5, 0, 0);
    const probe = new AudioSpaceProbe();
    probe.bind({
      getProbeOrigin: () => new THREE.Vector3(0, 0, 0),
      getSolidMeshes: () => [wall],
    });
    expectEnclosed(probe.sampleRoomCharacter());
  });

  it('detects far solid geometry as a larger space and ignores the selection mesh', () => {
    const farWall = createBoxMesh(2, 20, 20, 40, 0, 0);
    const selected = createBoxMesh(1, 1, 1, 0.5, 0, 0);
    const probe = new AudioSpaceProbe();
    probe.bind({
      getProbeOrigin: () => new THREE.Vector3(0, 0, 0),
      getSolidMeshes: () => [farWall, selected],
      getIgnoredObjects: () => [selected],
    });
    const character = probe.sampleRoomCharacter();
    expectEnclosed(character);
    expect(character.wetGain).toBeGreaterThan(0.1);
    expect(character.wetGain).toBeLessThanOrEqual(0.22);
    expect(character.tailDelayScale).toBeGreaterThan(0.8);
  });

  it('uses fixed world axes so hallway acoustics stay stable mid-corridor', () => {
    const left = createBoxMesh(1, 4, 20, -2, 0, 0);
    const right = createBoxMesh(1, 4, 20, 2, 0, 0);
    const nearEnd = createBoxMesh(4, 4, 1, 0, 0, -15);
    const farEnd = createBoxMesh(4, 4, 1, 0, 0, 15);
    const probe = new AudioSpaceProbe();
    probe.bind({
      getProbeOrigin: () => new THREE.Vector3(0, 0, 0),
      getSolidMeshes: () => [left, right, nearEnd, farEnd],
    });
    const atCenter = probe.sampleRoomCharacterAt(new THREE.Vector3(0, 0, 0));
    const midRun = probe.sampleRoomCharacterAt(new THREE.Vector3(0, 0, 8));
    expectHallwayLike(atCenter);
    expectHallwayLike(midRun);
  });

  it('can sample room rays from an explicit sound-placement origin', () => {
    const wall = createBoxMesh(1, 4, 4, 2, 0, 0);
    const probe = new AudioSpaceProbe();
    probe.bind({
      getProbeOrigin: () => new THREE.Vector3(100, 0, 0),
      getSolidMeshes: () => [wall],
    });
    expectEnclosed(probe.sampleRoomCharacterAt(new THREE.Vector3(0, 0, 0)));
    expect(probe.sampleRoomCharacter()).toBe(AUDIO_ROOM_CHARACTER_VOID);
  });

  it('still finds nearby walls when many distant meshes exist', () => {
    const nearWall = createBoxMesh(1, 4, 4, 2, 0, 0);
    const distant: THREE.Mesh[] = [];
    for (let index = 0; index < 300; index++) {
      distant.push(createBoxMesh(1, 1, 1, 50 + index * 0.1, 20, 0));
    }
    const probe = new AudioSpaceProbe();
    probe.bind({
      getProbeOrigin: () => new THREE.Vector3(0, 0, 0),
      getSolidMeshes: () => [...distant, nearWall],
    });
    expectEnclosed(probe.sampleRoomCharacter());
  });
});

/**
 * Asserts continuous enclosed reverb is audible (not outdoor void).
 *
 * @param character Room character under test.
 */
function expectEnclosed(character: AudioRoomCharacter): void {
  expect(character).not.toBe(AUDIO_ROOM_CHARACTER_VOID);
  expect(character.wetGain).toBeGreaterThanOrEqual(0.08);
}

/**
 * Asserts corridor-like early/tail shaping.
 *
 * @param character Room character under test.
 */
function expectHallwayLike(character: AudioRoomCharacter): void {
  expectEnclosed(character);
  expect(character.tailDelayScale).toBeGreaterThan(character.earlyDelayScale * 1.05);
  expect(character.tailFeedback).toBeGreaterThan(0.18);
  expect(character.wetGain).toBeLessThanOrEqual(0.22);
}

/**
 * Creates a positioned box mesh with up-to-date world matrices.
 *
 * @param sizeX Box size X.
 * @param sizeY Box size Y.
 * @param sizeZ Box size Z.
 * @param x World position X.
 * @param y World position Y.
 * @param z World position Z.
 * @returns Mesh ready for raycasting.
 */
function createBoxMesh(sizeX: number, sizeY: number, sizeZ: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ));
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}
