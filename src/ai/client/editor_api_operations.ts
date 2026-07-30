import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { McpSolidOperationName } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Maps a solid operation enum to an MCP string name.
 *
 * @param operation Solid operation enum value.
 * @returns MCP operation name.
 */
export function solidOperationToName(operation: SolidOperation): McpSolidOperationName {
  if (operation === SolidOperation.Additive) return 'additive';
  if (operation === SolidOperation.Subtractive) return 'subtractive';
  return 'intersecting';
}

/**
 * Maps an MCP operation name to the solid operation enum.
 *
 * @param name MCP operation name or unknown string.
 * @returns Solid operation or null when invalid.
 */
export function nameToSolidOperation(name: string | undefined): SolidOperation | null {
  if (name === 'additive') return SolidOperation.Additive;
  if (name === 'subtractive') return SolidOperation.Subtractive;
  if (name === 'intersecting') return SolidOperation.Intersecting;
  return null;
}

/**
 * Parses a defaultable operation name, falling back to additive.
 *
 * @param name Optional MCP operation name.
 * @returns Solid operation enum.
 */
export function parseOperationOrAdditive(name: string | undefined): SolidOperation {
  return nameToSolidOperation(name) ?? SolidOperation.Additive;
}
