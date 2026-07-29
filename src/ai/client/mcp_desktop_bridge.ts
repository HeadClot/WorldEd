import type { McpHostStartResult, McpHostStatus } from '../shared/mcp_protocol_types.js';
import type { ElectrobunDesktopBunRpcClient } from '../shared/mcp_rpc_schema.js';

/** Renderer-side bridge for starting and stopping the Electrobun MCP host. */
export interface McpDesktopBridge {
  startMcpServer: () => Promise<McpHostStartResult>;
  stopMcpServer: () => Promise<McpHostStatus>;
  getMcpStatus: () => Promise<McpHostStatus>;
}

declare global {
  interface Window {
    aiworldedMcpBridge?: McpDesktopBridge;
  }
}

/**
 * Creates a desktop MCP bridge backed by Electrobun Bun RPC.
 *
 * @param rpc Typed RPC client connected to the Bun process.
 * @returns MCP desktop bridge.
 */
export function createMcpDesktopBridge(rpc: ElectrobunDesktopBunRpcClient): McpDesktopBridge {
  return {
    startMcpServer: () => rpc.request.startMcpServer(),
    stopMcpServer: () => rpc.request.stopMcpServer(),
    getMcpStatus: () => rpc.request.getMcpStatus(),
  };
}

/**
 * Returns the desktop MCP bridge when running under Electrobun.
 *
 * @returns Bridge or null in the browser web build.
 */
export function getMcpDesktopBridge(): McpDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.aiworldedMcpBridge ?? null;
}
