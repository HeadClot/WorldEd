import { BrowserView, BrowserWindow, Updater } from 'electrobun/bun';
import type { ElectrobunUpdaterRpcSchema } from '../../updater/electrobun_updater_rpc.js';
import type { StandaloneHostUpdateCheck } from '../../updater/update_types.js';

const updaterRpc = BrowserView.defineRPC<ElectrobunUpdaterRpcSchema>({
  handlers: {
    requests: {
      checkForUpdate: checkForUpdate,
      installUpdate: installUpdate,
    },
  },
});

new BrowserWindow({
  title: 'AiWorldEd',
  url: 'views://main_ui/index.html',
  frame: {
    x: 80,
    y: 60,
    width: 1600,
    height: 1000,
  },
  rpc: updaterRpc,
});

/** Checks Electrobun's configured release channel. */
async function checkForUpdate(): Promise<StandaloneHostUpdateCheck> {
  const current = await Updater.getLocalInfo();
  const latest = await Updater.checkForUpdate();
  return {
    currentVersion: current.version,
    latestVersion: latest.version,
    updateAvailable: latest.updateAvailable,
    error: latest.error || undefined,
  };
}

/** Downloads and applies the update prepared by Electrobun. */
async function installUpdate(): Promise<void> {
  await Updater.downloadUpdate();
  await Updater.applyUpdate();
}
