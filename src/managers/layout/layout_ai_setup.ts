import type * as THREE from 'three';
import type { CommandStack } from '../../commands/command_stack.js';
import type { SelectionManager } from '../../selection/object/selection_manager.js';
import type { SolidModelController } from '../solid/solid_model_controller.js';
import type { GridSnap } from '../../transform/snap/grid_snap.js';
import type { SnapManager } from '../../transform/snap/snap_manager.js';
import { EditorApi } from '../../ai/client/editor_api.js';
import { sharedMcpBridgeHandler } from '../../ai/client/mcp_bridge_handler.js';

/** Host fields required to wire the AI EditorApi bridge. */
export interface LayoutAiSetupHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  solidModelController: SolidModelController | null;
  gridSnap: GridSnap;
  snapManager: SnapManager;
  getUserSnapEnabled: () => boolean;
  refreshAfterWorldMutation: () => void;
  refreshOutliner: () => void;
  showStatusMessage: (message: string) => void;
}

/** Result of AI layout wiring. */
export interface LayoutAiSetupResult {
  editorApi: EditorApi | null;
}

/**
 * Binds the EditorApi facade for MCP tool calls. UI lives on the main toolbar
 * (MCP dialog), not a separate strip.
 *
 * @param host Layout host with live editor systems.
 * @returns Bound API or null when solid tools are unavailable.
 */
export function setupLayoutAi(host: LayoutAiSetupHost): LayoutAiSetupResult {
  if (!host.solidModelController) {
    return { editorApi: null };
  }
  const editorApi = new EditorApi({
    worldObject: host.worldObject,
    commandStack: host.commandStack,
    selectionManager: host.selectionManager,
    solidModelController: host.solidModelController,
    gridSnap: host.gridSnap,
    snapManager: host.snapManager,
    getUserSnapEnabled: host.getUserSnapEnabled,
    refreshAfterWorldMutation: host.refreshAfterWorldMutation,
    refreshOutliner: host.refreshOutliner,
    showStatus: host.showStatusMessage,
  });
  sharedMcpBridgeHandler.bindEditorApi(editorApi);
  return { editorApi };
}
