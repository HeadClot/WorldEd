import { buildDesktopWindowTitle } from '@/application_identity.js';
import type { ElectrobunDesktopRpcSchema, ElectrobunDesktopWebviewCaller } from '@/ai/shared/mcp_rpc_schema.js';
import { McpHost } from '@/ai/server/mcp_host.js';
import type { StandaloneHostUpdateCheck } from '@/updater/update_types.js';
import { buildDesktopWindowFrame } from '@/desktop/desktop_window_maximize.js';
import { showMaximizedWhenReady } from '@/desktop/desktop_window_startup.js';
import { enableWindowsPerMonitorDpiAwareness } from '@/desktop/windows_dpi_awareness.js';
import { applyWindowsWindowIcon } from '@/desktop/windows_window_icon.js';

await enableWindowsPerMonitorDpiAwareness();

const { BrowserView, BrowserWindow, Screen, Updater } = await import('electrobun/bun');

const mcpHost = new McpHost();
let desktopRpc: ElectrobunDesktopWebviewCaller | null = null;

const desktopRpcBinding = BrowserView.defineRPC<ElectrobunDesktopRpcSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {
      checkForUpdate: checkForUpdate,
      installUpdate: installUpdate,
      startMcpServer: startMcpServer,
      stopMcpServer: stopMcpServer,
      getMcpStatus: getMcpStatus,
    },
  },
});
desktopRpc = desktopRpcBinding as unknown as ElectrobunDesktopWebviewCaller;

const localInfo = await Updater.getLocalInfo();
const windowTitle = buildDesktopWindowTitle(localInfo.version);
const desktopFrame = buildDesktopWindowFrame(Screen.getPrimaryDisplay().workArea);

const desktopWindow = new BrowserWindow({
  title: windowTitle,
  url: 'views://main_ui/index.html',
  frame: desktopFrame,
  hidden: true,
  activate: false,
  rpc: desktopRpcBinding,
});
showMaximizedWhenReady(desktopWindow, () => applyWindowsWindowIcon(windowTitle));

/** Checks Electrobun's configured release channel. */
async function checkForUpdate(): Promise<StandaloneHostUpdateCheck> {
  const current = await Updater.getLocalInfo();
  const latest = await Updater.checkForUpdate();
  const result: StandaloneHostUpdateCheck = {
    currentVersion: current.version,
    latestVersion: latest.version,
    updateAvailable: latest.updateAvailable,
  };
  if (latest.error) result.error = latest.error;
  return result;
}

/** Downloads and applies the update prepared by Electrobun. */
async function installUpdate(): Promise<void> {
  await Updater.downloadUpdate();
  await Updater.applyUpdate();
}

/**
 * Starts the local MCP host and forwards tools into the webview editor.
 *
 * @returns Start result with URL and token.
 */
function startMcpServer() {
  return mcpHost.start(async (name, args) => {
    if (!desktopRpc) {
      return { ok: false, message: 'Desktop RPC is not ready' };
    }
    return desktopRpc.request.invokeEditorTool({ name, arguments: args });
  });
}

/**
 * Stops the local MCP host.
 *
 * @returns Host status snapshot.
 */
function stopMcpServer() {
  return mcpHost.stop();
}

/**
 * Returns whether the MCP host is running.
 *
 * @returns Host status snapshot.
 */
function getMcpStatus() {
  return mcpHost.getStatus();
}
