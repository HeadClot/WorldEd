/**
 * Enables Windows per-monitor DPI awareness before any native windows open.
 *
 * Electrobun's WebView2 host is otherwise DPI-unaware on Windows, so Windows
 * bitmap-stretches the window and the UI looks blurry on HiDPI displays.
 * Calling this early lets WebView2 render at the monitor's native scale.
 *
 * @returns Promise that settles after the best-effort DPI setup finishes.
 */
export async function enableWindowsPerMonitorDpiAwareness(): Promise<void> {
  if (process.platform !== 'win32') return;
  try {
    const ffi = await loadBunFfiModule();
    if (tryEnablePerMonitorV2(ffi)) return;
    tryEnablePerMonitorAwareness(ffi);
  } catch {
    return;
  }
}

/**
 * Dynamically loads bun:ffi without a static specifier Vite can fail to
 * resolve.
 *
 * @returns The bun:ffi module namespace.
 */
async function loadBunFfiModule(): Promise<BunFfiModule> {
  const moduleName = ['bun', 'ffi'].join(':');
  return import(/* @vite-ignore */ moduleName) as Promise<BunFfiModule>;
}

/** Minimal bun:ffi surface used for Windows DPI setup. */
interface BunFfiModule {
  dlopen: (
    path: string,
    symbols: Record<string, { args: unknown[]; returns: unknown }>,
  ) => {
    symbols: Record<string, (...args: never[]) => unknown>;
  };
  FFIType: {
    ptr: unknown;
    bool: unknown;
    u32: unknown;
    i32: unknown;
  };
}

/**
 * Attempts Per-Monitor V2 via user32 (Windows 10 1703+).
 *
 * @param ffi Bun FFI module loaded at runtime.
 * @returns True when the API reports success.
 */
function tryEnablePerMonitorV2(ffi: BunFfiModule): boolean {
  try {
    const user32 = ffi.dlopen('user32.dll', {
      SetProcessDpiAwarenessContext: {
        args: [ffi.FFIType.ptr],
        returns: ffi.FFIType.bool,
      },
    });
    const perMonitorV2 = -4 as never;
    return Boolean(user32.symbols.SetProcessDpiAwarenessContext(perMonitorV2));
  } catch {
    return false;
  }
}

/**
 * Falls back to PROCESS_PER_MONITOR_DPI_AWARE via shcore (Windows 8.1+).
 *
 * @param ffi Bun FFI module loaded at runtime.
 */
function tryEnablePerMonitorAwareness(ffi: BunFfiModule): void {
  try {
    const shcore = ffi.dlopen('shcore.dll', {
      SetProcessDpiAwareness: {
        args: [ffi.FFIType.u32],
        returns: ffi.FFIType.i32,
      },
    });
    const processPerMonitorDpiAware = 2 as never;
    shcore.symbols.SetProcessDpiAwareness(processPerMonitorDpiAware);
  } catch {
    return;
  }
}
