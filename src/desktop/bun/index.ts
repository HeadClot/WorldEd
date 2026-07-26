import { buildDesktopWindowTitle } from '../../application_identity.js';
import type { ElectrobunUpdaterRpcSchema } from '../../updater/electrobun_updater_rpc.js';
import type { StandaloneHostUpdateCheck } from '../../updater/update_types.js';
import { buildDesktopWindowFrame } from '../desktop_window_maximize.js';
import { showMaximizedWhenReady } from '../desktop_window_startup.js';
import { enableWindowsPerMonitorDpiAwareness } from '../windows_dpi_awareness.js';
import { applyWindowsWindowIcon } from '../windows_window_icon.js';

await enableWindowsPerMonitorDpiAwareness();

const { BrowserView, BrowserWindow, Screen, Updater } = await import('electrobun/bun');

const updaterRpc = BrowserView.defineRPC<ElectrobunUpdaterRpcSchema>({
  handlers: {
    requests: {
      checkForUpdate: checkForUpdate,
      installUpdate: installUpdate,
    },
  },
});

const localInfo = await Updater.getLocalInfo();
const windowTitle = buildDesktopWindowTitle(localInfo.version);
const desktopFrame = buildDesktopWindowFrame(Screen.getPrimaryDisplay().workArea);

const desktopWindow = new BrowserWindow({
  title: windowTitle,
  url: 'views://main_ui/index.html',
  frame: desktopFrame,
  hidden: true,
  activate: false,
  rpc: updaterRpc,
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
