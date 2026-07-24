import { Electroview } from 'electrobun/view';
import {
  createElectrobunUpdaterBridge,
  type ElectrobunUpdaterRpcSchema,
} from '../../updater/electrobun_updater_rpc.js';

const updaterRpc = Electroview.defineRPC<ElectrobunUpdaterRpcSchema>({
  handlers: { requests: {} },
});

new Electroview({ rpc: updaterRpc });
window.aiworldedStandaloneUpdater = createElectrobunUpdaterBridge(updaterRpc);
await import('../../app.js');
