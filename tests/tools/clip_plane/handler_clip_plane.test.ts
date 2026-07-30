import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '@/tools/clip_plane/clip_plane_preview.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneJSON } from '@/io/scene/io_types.js';

describe('ClipPlaneHandler preview after scene load', () => {
  let worldObject: THREE.Group;
  let clipPlaneTool: ToolClipPlane;
  let handler: HandlerClipPlane;

  beforeEach(() => {
    worldObject = new THREE.Group();
    clipPlaneTool = new ToolClipPlane();
    handler = new HandlerClipPlane({
      worldObject,
      commandStack: new CommandStack(32),
      selectionManager: new ManagerSelection(),
      gridSnap: new GridSnap(false, 1),
      clipPlaneTool,
      modalToolSessionRegistry: { runWithSelectionEndSuppressed: (work: () => void) => work() } as never,
      showStatusMessage: vi.fn(),
      syncPrimitivesToViewports: vi.fn(),
      refreshOutliner: vi.fn(),
      updateShadingMeshes: vi.fn(),
      onToolStateChanged: vi.fn(),
    });
  });

  it('should keep the preview root under the world object after construction', () => {
    const previewRoot = handler.getPreview().getRoot();
    expect(previewRoot.parent).toBe(worldObject);
    expect(previewRoot.userData[CLIP_PREVIEW_USERDATA_KEY]).toBe(true);
  });

  it('should restore preview parent and visuals after a scene clear removes it', () => {
    clipPlaneTool.activate();
    clipPlaneTool.addPoint(new THREE.Vector3(0, 0, 0));
    clipPlaneTool.addPoint(new THREE.Vector3(2, 0, 0));
    handler.getPreview().syncFromTool(clipPlaneTool);
    expect(handler.getPreview().getRoot().children.length).toBeGreaterThan(0);
    forceRemoveAllWorldChildren(worldObject);
    expect(handler.getPreview().getRoot().parent).toBeNull();
    handler.reattachPreviewToWorld();
    const previewRoot = handler.getPreview().getRoot();
    expect(previewRoot.parent).toBe(worldObject);
    expect(previewRoot.children.length).toBeGreaterThan(0);
  });

  it('should keep preview attached through SceneDeserializer load', () => {
    clipPlaneTool.activate();
    clipPlaneTool.addPoint(new THREE.Vector3(1, 0, 0));
    clipPlaneTool.addPoint(new THREE.Vector3(3, 0, 0));
    handler.getPreview().syncFromTool(clipPlaneTool);
    const previewRoot = handler.getPreview().getRoot();
    const contentMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    worldObject.add(contentMesh);
    const deserializer = new SceneDeserializer();
    const sceneData: SceneJSON = { version: 1, objects: [] };
    deserializer.deserialize(sceneData, worldObject);
    expect(previewRoot.parent).toBe(worldObject);
    expect(worldObject.children).toContain(previewRoot);
    expect(worldObject.children).not.toContain(contentMesh);
    expect(previewRoot.children.length).toBeGreaterThan(0);
  });
});

/**
 * Removes every world child without the deserializer preserve path. Simulates a
 * broken clear that detaches the clip preview.
 *
 * @param worldObject World root group.
 */
function forceRemoveAllWorldChildren(worldObject: THREE.Group): void {
  Array.from(worldObject.children).forEach((child) => {
    worldObject.remove(child);
  });
}
