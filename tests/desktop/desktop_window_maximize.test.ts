import { describe, expect, it, vi } from 'vitest';

import { buildDesktopWindowFrame, maximizeDesktopWindow } from '@/desktop/desktop_window_maximize.js';

describe('desktop window maximized startup', () => {
  it('initializes the hosted webview at the native desktop work area size', () => {
    const workArea = { x: 17, y: 29, width: 1873, height: 941 };

    const frame = buildDesktopWindowFrame(workArea);

    expect(frame).toEqual(workArea);
    expect(frame).not.toBe(workArea);
  });

  it('maximizes the native window so its webview resizes with the desktop', () => {
    const maximize = vi.fn();
    const desktopWindow = { maximize };

    maximizeDesktopWindow(desktopWindow);

    expect(maximize).toHaveBeenCalledOnce();
  });
});
