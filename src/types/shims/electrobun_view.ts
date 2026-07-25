/**
 * Type-only shim for `electrobun/view` under strict checking. Runtime
 * resolution still uses the real package via the bundler.
 */

/** Minimal RPC transport surface used by Electroview. */
export type RpcWithTransport = {
  setTransport?: (transport: unknown) => void;
  request?: Record<string, (...args: never[]) => Promise<unknown>>;
};

/** Configuration for defineRPC. */
export type DefineRpcConfig = {
  handlers: {
    requests?: Record<string, unknown>;
    messages?: Record<string, unknown>;
  };
};

/** Browser-side Electroview host used by the desktop renderer entrypoint. */
export class Electroview {
  /**
   * Defines a typed RPC schema for browser-to-bun communication.
   *
   * @param _config Handler configuration for requests and messages.
   * @returns RPC client instance with transport hooks.
   */
  static defineRPC<TSchema = RpcWithTransport>(_config: DefineRpcConfig): TSchema {
    return {} as TSchema;
  }

  /** @param _config Construction options including the RPC client. */
  constructor(_config: { rpc: unknown }) {}
}
