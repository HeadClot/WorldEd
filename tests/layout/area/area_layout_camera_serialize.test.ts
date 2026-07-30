import { describe, expect, it } from 'vitest';
import {
  attachCamerasToSerializedLayout,
  restoreCamerasFromSerializedLayout,
  serializeAreaLayout,
} from '@/layout/area/area_layout_serializer.js';
import { createDualTopPerspectiveLayout } from '@/layout/area/area_layout_presets.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';
import type { ViewportCameraSnapshot } from '@/viewports/core/viewport_camera_snapshot.js';

describe('area layout camera serialization', () => {
  it('attaches and restores camera snapshots by area id', () => {
    const root = createDualTopPerspectiveLayout();
    const layout = serializeAreaLayout(root);
    const leaves = listAreaLeafPlacements(root);
    const firstId = leaves[0]!.payload.areaId;
    const snapshot: ViewportCameraSnapshot = {
      kind: 'orthographic',
      position: [0, 12, 0],
      quaternion: [0, 0, 0, 1],
      left: -3,
      right: 3,
      top: 2,
      bottom: -2,
    };
    attachCamerasToSerializedLayout(layout, (areaId) => (areaId === firstId ? snapshot : null));
    const restored: Array<{ areaId: string; camera: ViewportCameraSnapshot }> = [];
    restoreCamerasFromSerializedLayout(layout, (areaId, camera) => {
      restored.push({ areaId, camera });
    });
    expect(restored).toHaveLength(1);
    expect(restored[0]!.areaId).toBe(firstId);
    expect(restored[0]!.camera).toEqual(snapshot);
  });
});
