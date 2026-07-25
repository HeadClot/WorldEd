/**
 * Type-only shim for `electrobun/bun` under strict checking. Runtime resolution
 * still uses the real package via Electrobun's bundler.
 */

/** Local app info returned by the Electrobun updater. */
export type ElectrobunLocalInfo = {
  version: string;
};

/** Result of checking the Electrobun release channel. */
export type ElectrobunUpdateCheck = {
  version: string;
  updateAvailable: boolean;
  error?: string;
};

/** Window frame rectangle. */
export type ElectrobunWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Native display information used to size desktop windows. */
export type ElectrobunDisplay = {
  workArea: ElectrobunWindowFrame;
};

/** Browser window construction options. */
export type ElectrobunWindowOptions = {
  title?: string;
  url?: string;
  frame?: ElectrobunWindowFrame;
  rpc?: unknown;
};

/** Configuration for defineRPC on the Bun side. */
export type DefineRpcConfig = {
  handlers: {
    requests?: Record<string, (...args: never[]) => unknown>;
    messages?: Record<string, unknown>;
  };
};

/** Bun-side browser view helpers. */
export class BrowserView {
  /**
   * Defines a typed RPC schema for bun-to-browser communication.
   *
   * @param _config Handler configuration for requests and messages.
   * @returns RPC instance attached to browser windows.
   */
  static defineRPC<TSchema>(_config: DefineRpcConfig): TSchema {
    return {} as TSchema;
  }
}

/** Native desktop window host. */
export class BrowserWindow {
  /** @param _options Window title, URL, frame, and RPC binding. */
  constructor(_options: ElectrobunWindowOptions) {}

  /** Expands the native window to the available desktop size. */
  maximize(): void {}
}

/** Native screen information exposed by Electrobun. */
export const Screen = {
  /** @returns Primary display bounds and usable work area. */
  getPrimaryDisplay(): ElectrobunDisplay {
    return { workArea: { x: 0, y: 0, width: 800, height: 600 } };
  },
};

/** Electrobun built-in updater API. */
export const Updater = {
  /** @returns Local package version information. */
  async getLocalInfo(): Promise<ElectrobunLocalInfo> {
    return { version: '0.0.0' };
  },

  /** @returns Channel update availability information. */
  async checkForUpdate(): Promise<ElectrobunUpdateCheck> {
    return { version: '0.0.0', updateAvailable: false };
  },

  /** Downloads the available update package. */
  async downloadUpdate(): Promise<void> {},

  /** Applies a downloaded update and restarts. */
  async applyUpdate(): Promise<void> {},
};

/** Electrobun application config type used by electrobun.config.ts. */
export type ElectrobunConfig = Record<string, unknown>;
