import { MCP_DEFAULT_PORT, MCP_PORT_SEARCH_RANGE } from '@/ai/shared/mcp_constants.js';

/** Bound port for a running MCP host. */
export interface SessionMcpState {
  port: number;
}

/**
 * Builds a new session state for a chosen port.
 *
 * @param port Bound TCP port.
 * @returns Session state.
 */
export function createMcpSessionState(port: number): SessionMcpState {
  return { port };
}

/**
 * Lists candidate ports starting at the default base.
 *
 * @param basePort First port to try.
 * @param range How many ports to try including the base.
 * @returns Port candidates.
 */
export function listMcpPortCandidates(
  basePort: number = MCP_DEFAULT_PORT,
  range: number = MCP_PORT_SEARCH_RANGE,
): number[] {
  const ports: number[] = [];
  for (let offset = 0; offset < range; offset++) {
    ports.push(basePort + offset);
  }
  return ports;
}
