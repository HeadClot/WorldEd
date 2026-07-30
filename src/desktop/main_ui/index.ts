import { Electroview } from 'electrobun/view';
import { buildDesktopWindowTitle } from '@/application_identity.js';
import { sharedMcpBridgeHandler } from '@/ai/client/handler_mcp_bridge.js';
import { createMcpDesktopBridge } from '@/ai/client/bridge_mcp_desktop.js';
import type { ElectrobunDesktopBunRpcClient, ElectrobunDesktopRpcSchema } from '@/ai/shared/mcp_rpc_schema.js';
import type { McpInvokeEditorToolParams } from '@/ai/shared/mcp_protocol_types.js';
import { createElectrobunUpdaterBridge, type ElectrobunUpdaterRpcClient } from '@/updater/electrobun_updater_rpc.js';

document.title = buildDesktopWindowTitle();

const desktopRpc = Electroview.defineRPC<ElectrobunDesktopRpcSchema>({
  handlers: {
    requests: {
      invokeEditorTool: (params: McpInvokeEditorToolParams) => sharedMcpBridgeHandler.invokeEditorTool(params),
    },
  },
}) as unknown as ElectrobunDesktopBunRpcClient & ElectrobunUpdaterRpcClient;

new Electroview({ rpc: desktopRpc as never });
window.aiworldedStandaloneUpdater = createElectrobunUpdaterBridge(desktopRpc);
window.aiworldedMcpBridge = createMcpDesktopBridge(desktopRpc);
await import('@/app.js');
