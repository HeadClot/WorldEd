import type { ViewportToolChromeHost } from '@/tools/chrome/host/viewport_tool_chrome_host.js';

/** Tracks which per-pane tool chrome is hover-owned so non-owned panes can dim. */
export class ViewportToolChromeHoverOwner {
  private readonly hosts: Set<ViewportToolChromeHost>;
  private owner: ViewportToolChromeHost | null;

  /** Creates an empty hover owner tracker. */
  constructor() {
    this.hosts = new Set();
    this.owner = null;
  }

  /**
   * Registers a pane chrome host. New hosts start hidden until pointer enter.
   *
   * @param host Pane chrome.
   */
  register(host: ViewportToolChromeHost): void {
    this.hosts.add(host);
    host.setHoverOwned(this.owner === host);
  }

  /**
   * Unregisters a pane chrome host.
   *
   * @param host Pane chrome.
   */
  unregister(host: ViewportToolChromeHost): void {
    this.hosts.delete(host);
    if (this.owner !== host) {
      return;
    }
    this.owner = null;
    const next = this.hosts.values().next().value as ViewportToolChromeHost | undefined;
    if (next) {
      this.setOwner(next);
    }
  }

  /**
   * Marks a host as the hover owner and dims the others.
   *
   * @param host Host that received pointer enter.
   */
  setOwner(host: ViewportToolChromeHost): void {
    this.owner = host;
    this.hosts.forEach((candidate) => {
      candidate.setHoverOwned(candidate === host);
    });
  }

  /**
   * Returns the current hover owner.
   *
   * @returns Owner host or null.
   */
  getOwner(): ViewportToolChromeHost | null {
    return this.owner;
  }

  /** Clears all hosts. */
  clear(): void {
    this.hosts.clear();
    this.owner = null;
  }
}
