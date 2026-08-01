import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  publishLayoutTransformLiveVisuals,
  shouldPublishLiveVisualsAfterModalKey,
} from '@/layout/setup/layout_transform_live_visuals.js';

describe('shouldPublishLiveVisualsAfterModalKey', () => {
  it('publishes only when the modal key was handled and the drag is still active', () => {
    expect(shouldPublishLiveVisualsAfterModalKey(true, true)).toBe(true);
    expect(shouldPublishLiveVisualsAfterModalKey(true, false)).toBe(false);
    expect(shouldPublishLiveVisualsAfterModalKey(false, true)).toBe(false);
    expect(shouldPublishLiveVisualsAfterModalKey(false, false)).toBe(false);
  });
});

describe('publishLayoutTransformLiveVisuals', () => {
  it('forwards the same live sinks used by pointer moves', () => {
    const mesh = new THREE.Mesh();
    const root = new THREE.Object3D();
    const onTransformsLive = vi.fn();
    const onLiveTransformOverlaySync = vi.fn();
    const onRulerTransformFeedback = vi.fn();
    publishLayoutTransformLiveVisuals(
      { onTransformsLive, onLiveTransformOverlaySync, onRulerTransformFeedback },
      { selectedMeshes: [mesh], transformTargets: [root] },
    );
    expect(onTransformsLive).toHaveBeenCalledWith([mesh]);
    expect(onLiveTransformOverlaySync).toHaveBeenCalledWith([root], [mesh]);
    expect(onRulerTransformFeedback).toHaveBeenCalledWith([mesh], 'move');
  });
});
