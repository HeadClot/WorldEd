import { describe, expect, it, vi } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { GITHUB_RELEASES_PAGE_URL } from '@/updater/github_release_client.js';
import { StandaloneUpdateService } from '@/updater/standalone_update_service.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { SettingsUpdaterTab } from '@/ui/settings/settings_updater_tab.js';

describe('SettingsUpdaterTab', () => {
  it('explains browser limitations, shows the embedded app version, and links to releases', () => {
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    const tab = new SettingsUpdaterTab(store, new StandaloneUpdateService({ bridge: null, currentVersion: '1.24.0' }));
    const link = tab.getElement().querySelector('a');

    expect(tab.getElement().textContent).toContain('Version: 1.24.0');
    expect(tab.getElement().textContent).toContain('standalone executable builds');
    expect(link?.href).toBe(GITHUB_RELEASES_PAGE_URL);
  });

  it('shows the automatic update toggle Off and persists its On state', () => {
    const storage = new MemorySettingsStorage();
    const store = new EditorSettingsStore(storage);
    const tab = new SettingsUpdaterTab(
      store,
      new StandaloneUpdateService({ bridge: { installUpdate: () => undefined } }),
    );
    const toggle = tab.getElement().querySelector<HTMLInputElement>('[data-settings-field="auto-updater"]');

    expect(toggle?.checked).toBe(false);
    expect(toggle?.getAttribute('role')).toBe('switch');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(tab.getElement().textContent).toContain('Auto updater');
    expect(tab.getElement().textContent).toContain('Off');

    toggle!.checked = true;
    toggle!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(store.getUpdateSettings().automaticChecks).toBe(true);
    expect(new EditorSettingsStore(storage).getUpdateSettings().automaticChecks).toBe(true);
    expect(toggle?.checked).toBe(true);
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(tab.getElement().textContent).toContain('On');
  });

  it('skips automatic checks when Off and resumes them when switched On', async () => {
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    store.setAutomaticUpdateChecksEnabled(false);
    const checkForUpdate = vi.fn(async () => ({
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      updateAvailable: false,
    }));
    const tab = new SettingsUpdaterTab(
      store,
      new StandaloneUpdateService({
        bridge: { kind: 'electrobun', checkForUpdate, installUpdate: () => undefined },
      }),
    );

    tab.activate();
    await Promise.resolve();
    expect(checkForUpdate).not.toHaveBeenCalled();

    store.setAutomaticUpdateChecksEnabled(true);
    tab.rebuild();
    tab.activate();
    await Promise.resolve();
    expect(checkForUpdate).toHaveBeenCalledOnce();
  });
});
