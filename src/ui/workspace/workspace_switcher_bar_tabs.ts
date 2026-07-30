/**
 * Lists workspace tab buttons currently in the strip.
 *
 * @param tabsHost Tab strip host element.
 * @returns Tab buttons with data-workspace-id.
 */
export function workspaceSwitcherListTabButtons(tabsHost: HTMLElement): HTMLButtonElement[] {
  return Array.from(tabsHost.querySelectorAll('button[data-workspace-id]')).filter(
    (element): element is HTMLButtonElement => element instanceof HTMLButtonElement,
  );
}

/**
 * Finds the tab under or nearest to a client X (covers flex gaps between tabs).
 *
 * @param tabsHost Tab strip host element.
 * @param clientX Pointer X in viewport coordinates.
 * @returns Hit tab and id, or null when the strip is empty.
 */
export function workspaceSwitcherResolveTabDropTargetAtClientX(
  tabsHost: HTMLElement,
  clientX: number,
): { tab: HTMLButtonElement; workspaceId: string } | null {
  const tabs = workspaceSwitcherListTabButtons(tabsHost);
  if (tabs.length === 0) {
    return null;
  }
  const direct = workspaceSwitcherFindTabContainingClientX(tabs, clientX);
  if (direct) {
    return direct;
  }
  return workspaceSwitcherFindNearestTabByClientX(tabs, clientX);
}

/**
 * Returns the tab whose bounds contain the client X, if any.
 *
 * @param tabs Tab buttons to search.
 * @param clientX Pointer X in viewport coordinates.
 * @returns Hit tab and id, or null.
 */
export function workspaceSwitcherFindTabContainingClientX(
  tabs: readonly HTMLButtonElement[],
  clientX: number,
): { tab: HTMLButtonElement; workspaceId: string } | null {
  if (!Number.isFinite(clientX)) {
    return null;
  }
  for (const tab of tabs) {
    const rect = tab.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) {
      continue;
    }
    const workspaceId = tab.dataset['workspaceId'];
    if (!workspaceId) {
      continue;
    }
    return { tab, workspaceId };
  }
  return null;
}

/**
 * Returns the tab whose horizontal center is nearest to the client X.
 *
 * @param tabs Tab buttons to search.
 * @param clientX Pointer X in viewport coordinates.
 * @returns Nearest tab and id, or null.
 */
export function workspaceSwitcherFindNearestTabByClientX(
  tabs: readonly HTMLButtonElement[],
  clientX: number,
): { tab: HTMLButtonElement; workspaceId: string } | null {
  if (!Number.isFinite(clientX)) {
    return null;
  }
  let best: HTMLButtonElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tab of tabs) {
    const rect = tab.getBoundingClientRect();
    const mid = (rect.left + rect.right) / 2;
    const distance = Math.abs(clientX - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tab;
    }
  }
  if (!best) {
    return null;
  }
  const workspaceId = best.dataset['workspaceId'];
  if (!workspaceId) {
    return null;
  }
  return { tab: best, workspaceId };
}
