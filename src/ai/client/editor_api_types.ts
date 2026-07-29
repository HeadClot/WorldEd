import type {
  McpBounds,
  McpBrushOrderEnd,
  McpDetailLevel,
  McpSolidOperationName,
  McpVec3,
} from '../shared/mcp_protocol_types.js';

export type {
  McpBounds,
  McpBrushOrderEnd,
  McpDetailLevel,
  McpSolidOperationName,
  McpVec3,
} from '../shared/mcp_protocol_types.js';

/** Compact solid model row for list tools. */
export interface SolidModelSummaryDto {
  modelId: string;
  name: string;
  brushCount: number;
  invertedWorld: boolean;
  worldBounds: McpBounds | null;
}

/** Brush row inside a solid model payload. */
export interface SolidBrushSummaryDto {
  brushId: string;
  name: string;
  operation: McpSolidOperationName;
  orderIndex: number;
  visible: boolean;
  position: McpVec3;
  /** Local Euler rotation in degrees (XYZ). Prefer this over radians. */
  rotationDegrees: McpVec3;
  scale: McpVec3;
  localBounds: McpBounds | null;
  worldBounds: McpBounds | null;
}

/** Full solid model payload with ordered brushes. */
export interface SolidModelDetailDto extends SolidModelSummaryDto {
  brushes: SolidBrushSummaryDto[];
}

/** Optional geometry payload for full brush detail. */
export interface SolidBrushGeometryDto {
  vertices: McpVec3[];
  faceCount: number;
  planes: Array<{ normal: McpVec3; distance: number }>;
}

/** Brush detail including optional topology. */
export interface SolidBrushDetailDto extends SolidBrushSummaryDto {
  modelId: string;
  geometry?: SolidBrushGeometryDto;
}

/** Snap settings exposed to the AI. */
export interface SnapSettingsDto {
  enabled: boolean;
  /** Translation grid step. */
  interval: number;
  /** Rotation snap step in degrees (e.g. 15). */
  rotationSnapDegrees: number;
  /** Scale factor snap step. */
  scaleSnapInterval: number;
}

/** Editor session context for planning tools. */
export interface EditorContextDto {
  applicationName: string;
  version: string;
  coordinateSystem: string;
  handedness: string;
  upAxis: string;
  snap: SnapSettingsDto;
  undoCount: number;
  redoCount: number;
  solidModelCount: number;
  selection: SelectionSummaryDto;
}

/** Selection summary for context and get_selection. */
export interface SelectionSummaryDto {
  brushIds: string[];
  solidModelIds: string[];
  meshCount: number;
}

/** Hierarchy node for shallow scene trees. */
export interface HierarchyNodeDto {
  id: string;
  name: string;
  kind: 'solid_model' | 'brush' | 'other';
  children: HierarchyNodeDto[];
}

/** Arguments accepted by add_box_brush. */
export interface AddBoxBrushArgs {
  modelId: string;
  size?: number | McpVec3;
  position?: McpVec3;
  /** Local Euler rotation in degrees (XYZ). Preferred. */
  rotationDegrees?: McpVec3;
  /** Legacy radians Euler; ignored when rotationDegrees is set. */
  rotation?: McpVec3;
  scale?: McpVec3;
  operation?: McpSolidOperationName;
  /** Display name (e.g. start_a_flag). Prefer stable names over Brush14. */
  name?: string;
  /** When false, skip grid snap. Same as exact:true. */
  snap?: boolean;
  /** When true, skip grid snap for precise placement. */
  exact?: boolean;
}

/** One box entry for add_box_brushes batch create. */
export interface AddBoxBrushBatchEntry {
  size?: number | McpVec3;
  position?: McpVec3;
  rotationDegrees?: McpVec3;
  scale?: McpVec3;
  operation?: McpSolidOperationName;
  name?: string;
  /** Insert after a brush with this display name after create. */
  insertAfterName?: string;
  /** Insert before a brush with this display name after create. */
  insertBeforeName?: string;
  /** Insert after this brush id after create. */
  insertAfterBrushId?: string;
  /** Insert before this brush id after create. */
  insertBeforeBrushId?: string;
}

/** Batch create many box brushes on one model. */
export interface AddBoxBrushesArgs {
  modelId: string;
  brushes: AddBoxBrushBatchEntry[];
  snap?: boolean;
  exact?: boolean;
}

/** Relative CSG order placement. */
export interface ReorderBrushRelativeArgs {
  brushId: string;
  relativeToBrushId?: string;
  relativeToName?: string;
  placement: 'before' | 'after';
}

/** Dry-run new box (same TRS fields as add_box_brush). */
export interface PreviewNewBoxArgs {
  modelId: string;
  size?: number | McpVec3;
  position?: McpVec3;
  rotationDegrees?: McpVec3;
  scale?: McpVec3;
  snap?: boolean;
  exact?: boolean;
}

/** Half-extents query. */
export interface HalfExtentsArgs {
  brushId: string;
}

/** Explain CSG membership at a world point. */
export interface ExplainCsgAtPointArgs {
  point: McpVec3;
  modelId?: string;
}

/** Approximate void connectivity between two world points. */
export interface QueryVoidConnectivityArgs {
  fromPoint: McpVec3;
  toPoint: McpVec3;
  modelId?: string;
}

/**
 * Place a wall segment on XZ. Centerline runs from→to; box size is {thickness,
 * height, length} with yaw aligning local +Z to the segment.
 */
export interface PlaceWallArgs {
  modelId: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
  height: number;
  thickness: number;
  /** Bottom of the wall (default 0). Position Y becomes baseY + height/2. */
  baseY?: number;
  operation?: McpSolidOperationName;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Hollow room shell: floor + four wall panels + optional ceiling. Outer size is
 * the exterior footprint; walls sit inside that AABB. Interior is empty without
 * carveInterior (default true still adds a nibble cut).
 */
export interface AddRoomShellArgs {
  modelId: string;
  /**
   * Exterior size (full width, full height including floor/ceiling, full
   * depth).
   */
  size: McpVec3;
  /** Room center (default y = size.y/2 so floor sits on y=0). */
  position?: McpVec3;
  wallThickness: number;
  floorThickness?: number;
  /** Use 0 for no ceiling. Default matches floorThickness / wallThickness. */
  ceilingThickness?: number;
  /**
   * When not false, adds a subtractive interior box slightly larger than the
   * clear span. The panel walls are already hollow; this is optional CSG
   * cleanup.
   */
  carveInterior?: boolean;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Minimal subtractive rectangular opening. position is the hole center; size is
 * full extents {x,y,z}. Does not auto-align to a wall.
 */
export interface CutOpeningArgs {
  modelId: string;
  position: McpVec3;
  size: McpVec3;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Door/window opening with optional frame. Axis-aligned walls only. Prefer
 * targetBrushId so the cut sits on the wall midplane, depth matches the wall,
 * and CSG order places the cut after that wall.
 */
export interface AddOpeningArgs {
  modelId: string;
  kind: 'window' | 'door';
  /**
   * Named room side (front=+Z outer, back=-Z, left=-X, right=+X). Sets
   * thickness axis only; does not move the opening onto a room. Prefer
   * targetBrushId.
   */
  wall?: 'front' | 'back' | 'left' | 'right';
  /** Thickness axis when wall is omitted (through-wall axis). Default z. */
  axis?: 'x' | 'z';
  /** Legacy; unused for placement. Kept for schema compatibility. */
  direction?: 1 | -1;
  /**
   * Opening center. When targetBrushId is set, the through-wall axis coordinate
   * is replaced with the wall midplane. Use sillHeight for bottom Y instead of
   * y.
   */
  position: McpVec3;
  size: { width: number; height: number; depth?: number };
  /** Fallback depth when size.depth and targetBrushId thickness are omitted. */
  wallThickness?: number;
  /**
   * Bottom Y of the opening (floor top for doors, sill for windows). When set,
   * center Y becomes sillHeight + height/2 (overrides position.y).
   */
  sillHeight?: number;
  /**
   * Wall brush to cut. Snaps cut to wall midplane, uses wall thickness as
   * depth, and reorders the subtractive brush after this wall. Strongly
   * recommended.
   */
  targetBrushId?: string;
  /** Frame strips (default true). Doors omit the bottom strip. */
  addFrame?: boolean;
  /** Center mullion (default false). Avoid for doors. */
  addMullions?: boolean;
  name?: string;
  snap?: boolean;
  exact?: boolean;
}

/** Partial transform update for a brush. */
export interface SetBrushTransformArgs {
  brushId: string;
  position?: McpVec3;
  /** Local Euler rotation in degrees (XYZ). Preferred. */
  rotationDegrees?: McpVec3;
  /** Legacy radians Euler; ignored when rotationDegrees is set. */
  rotation?: McpVec3;
  scale?: McpVec3;
  /** When false, skip grid/rotation/scale snap. */
  snap?: boolean;
  /** When true, skip snap (alias of snap:false). */
  exact?: boolean;
}

/** Batch transform updates. */
export interface BatchSetBrushTransformArgs {
  transforms: SetBrushTransformArgs[];
  /** Default snap for entries that omit snap/exact. */
  snap?: boolean;
  exact?: boolean;
}

/** Relative rotation for one brush (degrees, snapped when snap is on). */
export interface RotateBrushArgs {
  brushId: string;
  /** Rotation amount in degrees (relative by default). */
  degrees: number;
  /** Axis to rotate around. Default y (yaw) for level design. */
  axis?: 'x' | 'y' | 'z';
  /** When true, sets absolute angle on that axis instead of adding. */
  absolute?: boolean;
  snap?: boolean;
  exact?: boolean;
}

/** Rename one brush for stable AI-friendly ids. */
export interface RenameBrushArgs {
  brushId: string;
  name: string;
}

/**
 * Align moving brush to target brush face. mode top = stack on target top;
 * bottom = hang under; side = touch on axis.
 */
export interface AlignBrushArgs {
  brushId: string;
  targetBrushId: string;
  /** Top | bottom | side (requires axis). */
  mode: 'top' | 'bottom' | 'side';
  /** For mode side: which horizontal axis to touch (+/- direction). */
  axis?: 'x' | 'z';
  /** For mode side: +1 places on +axis face of target, -1 on -axis face. */
  direction?: 1 | -1;
  /** Gap between faces (world units). Default 0. */
  gap?: number;
  /** Center on the contact face in free axes (default true). */
  center?: boolean;
  snap?: boolean;
  exact?: boolean;
}

/** Dry-run transform: predicted world bounds without committing. */
export interface PreviewTransformArgs {
  brushId: string;
  position?: McpVec3;
  rotationDegrees?: McpVec3;
  rotation?: McpVec3;
  scale?: McpVec3;
  snap?: boolean;
  exact?: boolean;
}

/** Filtered brush inventory. */
export interface FindBrushesArgs {
  modelId?: string;
  /** Case-insensitive name substring. */
  nameContains?: string;
  /** Shape filter: thin|pole|tall|flat|panel|flag|long|box|any. */
  shape?: string;
  minHeight?: number;
  maxHeight?: number;
  /** World AABB region filter (center must be inside). */
  region?: McpBounds;
  limit?: number;
}

/** Mirror brushes across a world-aligned plane. */
export interface MirrorBrushesArgs {
  brushIds: string[];
  /** Mirror across X or Z (Y-up maps). */
  axis: 'x' | 'z';
  /** Plane position on axis (default 0). */
  plane?: number;
  /** When true (default), duplicate then mirror; when false, move in place. */
  copy?: boolean;
  snap?: boolean;
  exact?: boolean;
}

/** Duplicate brushes with optional offset and/or mirror. */
export interface DuplicateBrushesArgs {
  brushIds: string[];
  offset?: McpVec3;
  /** Optional mirror after duplicate (assembly flip). */
  mirrorAxis?: 'x' | 'z';
  mirrorPlane?: number;
  snap?: boolean;
  exact?: boolean;
}

/**
 * Plane clip of one brush. Define the plane with axis+distance (simplest),
 * point+normal, or three points. keepFront keeps the Three.js front half-space
 * (along the plane normal / +axis).
 */
export interface ClipBrushArgs {
  brushId: string;
  axis?: 'x' | 'y' | 'z';
  distance?: number;
  point?: McpVec3;
  normal?: McpVec3;
  pointA?: McpVec3;
  pointB?: McpVec3;
  pointC?: McpVec3;
  /** Keep the front half-space (default true). */
  keepFront?: boolean;
}

/** Split one brush into two pieces with the same plane definition as clip. */
export interface SplitBrushArgs {
  brushId: string;
  axis?: 'x' | 'y' | 'z';
  distance?: number;
  point?: McpVec3;
  normal?: McpVec3;
  pointA?: McpVec3;
  pointB?: McpVec3;
  pointC?: McpVec3;
}

/** Overlap query against a box or reference brush. */
export interface QueryOverlapsArgs {
  modelId?: string;
  brushId?: string;
  bounds?: McpBounds;
}

/** Neighbor query around a brush or point. */
export interface QueryNeighborsArgs {
  modelId?: string;
  brushId?: string;
  point?: McpVec3;
  radius: number;
  /** Max neighbors to return (nearest first). Default all in radius. */
  limit?: number;
}

/** Point containment query. */
export interface QueryPointArgs {
  modelId?: string;
  point: McpVec3;
}

/** Measure distance or size between entities. */
export interface MeasureArgs {
  fromBrushId?: string;
  toBrushId?: string;
  fromPoint?: McpVec3;
  toPoint?: McpVec3;
  brushId?: string;
}

/** Detail-level argument shared by several read tools. */
export interface DetailArgs {
  detail?: McpDetailLevel;
}

/** Reorder brushes to first or last CSG evaluation end. */
export interface ReorderBrushesArgs {
  brushIds: string[];
  end: McpBrushOrderEnd;
}
