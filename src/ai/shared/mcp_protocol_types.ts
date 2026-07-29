/** Detail level for solid model / brush tool responses. */
export type McpDetailLevel = 'summary' | 'full';

/** CSG operation labels exchanged over MCP (string form of SolidOperation). */
export type McpSolidOperationName = 'additive' | 'subtractive' | 'intersecting';

/** Brush reorder ends matching the editor command. */
export type McpBrushOrderEnd = 'first' | 'last';

/** Names of all solid-model MCP tools. */
export type McpToolName =
  | 'get_editor_context'
  | 'get_snap_settings'
  | 'undo'
  | 'redo'
  | 'list_solid_models'
  | 'get_solid_model'
  | 'get_brush'
  | 'get_scene_hierarchy'
  | 'get_selection'
  | 'get_csg_group'
  | 'create_csg_group'
  | 'set_group_operation'
  | 'ungroup_csg_groups'
  | 'reparent_solid_nodes'
  | 'rename_group'
  | 'find_brushes'
  | 'describe_brush'
  | 'half_extents'
  | 'query_brush_bounds'
  | 'query_overlaps'
  | 'query_point'
  | 'query_neighbors'
  | 'measure'
  | 'preview_transform'
  | 'preview_new_box'
  | 'explain_csg_at_point'
  | 'query_void_connectivity'
  | 'validate_brush'
  | 'validate_solid_model'
  | 'create_solid_model'
  | 'add_box_brush'
  | 'add_box_brushes'
  | 'place_wall'
  | 'add_room_shell'
  | 'cut_opening'
  | 'add_opening'
  | 'set_brush_operation'
  | 'set_brush_transform'
  | 'batch_set_brush_transform'
  | 'align_brush'
  | 'rotate_brush'
  | 'rename_brush'
  | 'clip_brush'
  | 'split_brush'
  | 'delete_brushes'
  | 'duplicate_brushes'
  | 'mirror_brushes'
  | 'reorder_brushes'
  | 'reorder_brush_relative'
  | 'set_inverted_world'
  | 'select'
  | 'calculate';

/** JSON vector DTO used at the MCP / EditorApi boundary. */
export interface McpVec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounds as min/max corners. */
export interface McpBounds {
  min: McpVec3;
  max: McpVec3;
}

/** Result envelope for every EditorApi tool invocation. */
export interface McpToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
  createdIds?: string[];
  warnings?: string[];
}

/** Live MCP host status returned to the desktop UI. */
export interface McpHostStatus {
  running: boolean;
  port: number | null;
  url: string | null;
}

/** Payload returned when the MCP host starts successfully. */
export interface McpHostStartResult {
  ok: boolean;
  message: string;
  status: McpHostStatus;
}

/** Arguments for Bun → webview tool invocation. */
export interface McpInvokeEditorToolParams {
  name: string;
  arguments: Record<string, unknown>;
}
