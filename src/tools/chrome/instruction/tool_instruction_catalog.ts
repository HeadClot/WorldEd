import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import type { ToolInstruction } from './tool_instruction.js';

/**
 * Returns the rail instruction for a primary editor tool.
 *
 * @param toolId Tool id.
 * @returns Instruction for tooltips.
 */
export function toolInstructionForEditorTool(toolId: EditorToolId): ToolInstruction {
  if (toolId === EditorToolId.FACE) {
    return {
      title: 'Face Select',
      shortcut: 'Shift+Tab',
      description:
        'Select individual faces on content meshes and solid results. Use Shift or Ctrl to extend the selection. Open the UV Editor or Extrude from the tool options bar.',
    };
  }
  if (toolId === EditorToolId.CLIP_PLANE) {
    return {
      title: 'Clip Plane',
      description:
        'Place a cutting plane through the selected mesh. Flip keeps the other side, Clip discards one half, Split keeps both. Requires a selected mesh. Esc cancels.',
    };
  }
  return {
    title: 'Object Select',
    shortcut: 'O',
    description:
      'Select whole objects in the viewport. Use transform modes on the options bar, or G / R / S for grab, rotate, and scale. Tab toggles Object Mode and Edit Mode.',
  };
}

/**
 * Returns the instruction for a transform mode control.
 *
 * @param mode Transform mode.
 * @returns Instruction for tooltips.
 */
export function toolInstructionForTransformMode(mode: TransformMode): ToolInstruction {
  if (mode === TransformMode.TRANSLATE) {
    return {
      title: 'Move',
      shortcut: 'W',
      description: 'Show the translate gizmo. Drag axes or use G for free grab move.',
    };
  }
  if (mode === TransformMode.ROTATE) {
    return {
      title: 'Rotate',
      shortcut: 'E',
      description: 'Show the rotate gizmo. Drag rings or use R for free rotate.',
    };
  }
  if (mode === TransformMode.SCALE) {
    return {
      title: 'Scale',
      shortcut: 'R',
      description: 'Show the scale gizmo. Drag handles or use S for free scale.',
    };
  }
  return {
    title: 'Bounds',
    shortcut: 'T',
    description: 'Show oriented bounds handles for one-sided resize and face drag.',
  };
}

/** Instruction for opening the UV editor from face mode. */
export const TOOL_INSTRUCTION_UV_EDITOR: ToolInstruction = {
  title: 'UV Editor',
  description: 'Open the UV panel to scale, offset, and rotate textures on selected faces.',
};

/** Instruction for face extrude. */
export const TOOL_INSTRUCTION_EXTRUDE: ToolInstruction = {
  title: 'Extrude',
  shortcut: 'Shift+E',
  description: 'Extrude the selected face regions into a new solid prism along their normals.',
};

/** Instruction for clip flip. */
export const TOOL_INSTRUCTION_CLIP_FLIP: ToolInstruction = {
  title: 'Flip Plane',
  shortcut: 'F',
  description: 'Flip which side of the clip plane is kept.',
};

/** Instruction for clip commit. */
export const TOOL_INSTRUCTION_CLIP_COMMIT: ToolInstruction = {
  title: 'Clip',
  shortcut: 'Enter',
  description: 'Keep one side of the plane and discard the other. The plane must be ready.',
};

/** Instruction for clip split. */
export const TOOL_INSTRUCTION_CLIP_SPLIT: ToolInstruction = {
  title: 'Split',
  shortcut: 'X',
  description: 'Cut the mesh into two pieces, keeping both sides of the plane.',
};

/** Instruction for Edit Mode vertex component select. */
export const TOOL_INSTRUCTION_COMPONENT_VERTEX: ToolInstruction = {
  title: 'Vertex Select',
  shortcut: '1',
  description: 'Select vertices on the edit domain. Available only in Edit Mode.',
};

/** Instruction for Edit Mode edge component select. */
export const TOOL_INSTRUCTION_COMPONENT_EDGE: ToolInstruction = {
  title: 'Edge Select',
  shortcut: '2',
  description: 'Select edges on the edit domain. Available only in Edit Mode.',
};

/** Instruction for Edit Mode face component select. */
export const TOOL_INSTRUCTION_COMPONENT_FACE: ToolInstruction = {
  title: 'Face Select',
  shortcut: '3',
  description: 'Select faces on the edit domain. Available only in Edit Mode.',
};
