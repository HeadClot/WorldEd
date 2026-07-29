import type { StandaloneHostUpdateCheck } from '../../updater/update_types.js';
import type {
  McpHostStartResult,
  McpHostStatus,
  McpInvokeEditorToolParams,
  McpToolResult,
} from './mcp_protocol_types.js';

/**
 * Combined Electrobun RPC schema for updater and AI MCP bridge. One schema is
 * required because BrowserWindow accepts a single RPC binding.
 */
export interface ElectrobunDesktopRpcSchema {
  bun: {
    requests: {
      checkForUpdate: { params: undefined; response: StandaloneHostUpdateCheck };
      installUpdate: { params: undefined; response: void };
      startMcpServer: { params: undefined; response: McpHostStartResult };
      stopMcpServer: { params: undefined; response: McpHostStatus };
      getMcpStatus: { params: undefined; response: McpHostStatus };
    };
    messages: {};
  };
  webview: {
    requests: {
      invokeEditorTool: { params: McpInvokeEditorToolParams; response: McpToolResult };
    };
    messages: {};
  };
}

/** Bun-side request surface used by the desktop UI bridge. */
export interface ElectrobunDesktopBunRpcClient {
  request: {
    checkForUpdate: () => Promise<StandaloneHostUpdateCheck>;
    installUpdate: () => Promise<void>;
    startMcpServer: () => Promise<McpHostStartResult>;
    stopMcpServer: () => Promise<McpHostStatus>;
    getMcpStatus: () => Promise<McpHostStatus>;
  };
}

/** Bun-side client that can call into the webview for tool execution. */
export interface ElectrobunDesktopWebviewCaller {
  request: {
    invokeEditorTool: (params: McpInvokeEditorToolParams) => Promise<McpToolResult>;
  };
}
