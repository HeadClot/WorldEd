import { Electroview } from 'electrobun/view';
import { buildDesktopWindowTitle } from '../../application_identity.js';
import {
  createElectrobunUpdaterBridge,
  type ElectrobunUpdaterRpcSchema,
} from '../../updater/electrobun_updater_rpc.js';

document.title = buildDesktopWindowTitle();

const updaterRpc = Electroview.defineRPC<ElectrobunUpdaterRpcSchema>({
  handlers: { requests: {} },
});

new Electroview({ rpc: updaterRpc });
window.aiworldedStandaloneUpdater = createElectrobunUpdaterBridge(updaterRpc);
await import('../../app.js');
