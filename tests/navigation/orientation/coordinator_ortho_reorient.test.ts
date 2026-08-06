import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CoordinatorEditorOrientation } from '@/navigation/orientation/coordinator_editor_orientation.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';

/**
 * Builds a minimal orthographic viewport stub that records orientation applies.
 *
 * @returns Stub viewport and spies.
 */
function createOrthoStub(): {
  viewport: ViewportEditor;
  applyGridOrientation: ReturnType<typeof vi.fn>;
  camera: THREE.OrthographicCamera;
} {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 50, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  const applyGridOrientation = vi.fn((orientation: { getWorldBasis: () => unknown }) => {
    void orientation;
  });
  const viewport = {
    getCamera: () => camera,
    getViewportKind: () => ViewportKind.TOP,
    applyGridOrientation,
    getContentElement: () => document.createElement('div'),
  } as unknown as ViewportEditor;
  return { viewport, applyGridOrientation, camera };
}

describe('CoordinatorEditorOrientation orthographic reorient', () => {
  it('applies grid orientation to orthographic viewports on face align', () => {
    const stub = createOrthoStub();
    const coordinator = new CoordinatorEditorOrientation({
      getViewports: () => [stub.viewport],
      showStatusMessage: () => undefined,
    });
    coordinator.bindViewports();
    expect(stub.applyGridOrientation).toHaveBeenCalled();
    stub.applyGridOrientation.mockClear();
    coordinator.alignGridToFace(new THREE.Vector3(1, 0, 0), new THREE.Vector3());
    expect(stub.applyGridOrientation).toHaveBeenCalled();
    coordinator.dispose();
  });
});
