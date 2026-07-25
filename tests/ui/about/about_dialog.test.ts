import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AboutDialog } from '../../../src/ui/about/about_dialog.js';
import {
  HENRYS_TOOLS_DISCORD_URL,
  PROJECT_DISPLAY_NAME,
  getAboutLicenseText,
} from '../../../src/ui/about/about_license_text.js';
import * as fetcher from '../../../src/ui/about/about_contributor_fetcher.js';

describe('AboutDialog', () => {
  let host: HTMLElement;
  let dialog: AboutDialog;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    vi.spyOn(fetcher, 'fetchGitHubContributors').mockResolvedValue([
      {
        login: 'testuser',
        avatarUrl: 'https://avatars.githubusercontent.com/testuser',
        profileUrl: 'https://github.com/testuser',
        contributions: 10,
        displayName: 'Test User',
      },
    ]);
    dialog = new AboutDialog(host);
  });

  afterEach(() => {
    dialog.dispose();
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
    vi.restoreAllMocks();
  });

  it('should start hidden until shown', () => {
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.getBackdropElement().style.display).toBe('none');
  });

  it('should open and close the modal overlay', () => {
    dialog.show();
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.getBackdropElement().style.display).toBe('flex');
    dialog.hide();
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.getBackdropElement().style.display).toBe('none');
  });

  it('should toggle visibility', () => {
    dialog.toggle();
    expect(dialog.isOpen()).toBe(true);
    dialog.toggle();
    expect(dialog.isOpen()).toBe(false);
  });

  it('should display the project name AI World Editor', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain(PROJECT_DISPLAY_NAME);
  });

  it('should credit Henry de Jongh as the human brain behind the project', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain('Henry de Jongh');
  });

  it('should credit Grok Build 4.5 and Qwen 3.6 27B', () => {
    dialog.show();
    const text = dialog.getPanelElement().textContent || '';
    expect(text).toContain('Grok Build 4.5');
    expect(text).toContain('Qwen 3.6 27B');
  });

  it('should include a GitHub Contributors section label', async () => {
    dialog.show();
    const panel = dialog.getPanelElement();

    await waitForContributorSpheres(panel);

    const labels = panel.querySelectorAll('div');
    const contributorLabel = Array.from(labels).find((el) => el.textContent === 'GitHub Contributors');
    expect(contributorLabel).toBeTruthy();
  });

  it('should render contributor spheres with avatar images', async () => {
    dialog.show();
    const panel = dialog.getPanelElement();

    await waitForContributorSpheres(panel);

    const rollContainer = panel.querySelector('.contributor-roll');
    expect(rollContainer).toBeTruthy();

    const spheres = rollContainer?.querySelectorAll('.contributor-sphere');
    expect(spheres?.length).toBeGreaterThanOrEqual(1);

    if (spheres && spheres.length > 0) {
      const img = spheres[0]!.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.src).toContain('avatars.githubusercontent.com');
    }
  });

  it('should credit humans, models, and three.js without reference-project names', () => {
    dialog.show();
    const text = dialog.getPanelElement().textContent || '';
    expect(text).toContain('Henry de Jongh');
    expect(text).toContain('three.js');
    expect(text.toLowerCase()).not.toContain('chisel');
    expect(text.toLowerCase()).not.toContain('realtimecsg');
    expect(text.toLowerCase()).not.toContain('sabrecsg');
  });

  it('should proclaim AI as the superior being', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain('AI is the superior being');
  });

  it("should provide a Discord button that opens Henry's Tools server", () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    dialog.show();
    const discordButton = findButtonByText(dialog.getPanelElement(), "Henry's Tools Discord");
    expect(discordButton).toBeTruthy();
    discordButton?.click();
    expect(openSpy).toHaveBeenCalledWith(HENRYS_TOOLS_DISCORD_URL, '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('should embed the three.js MIT license in a textbox', () => {
    const licenseBox = dialog.getLicenseTextArea();
    expect(licenseBox).toBeInstanceOf(HTMLTextAreaElement);
    expect(licenseBox.readOnly).toBe(true);
    expect(licenseBox.value).toBe(getAboutLicenseText());
    expect(licenseBox.value).toContain('three.js');
    expect(licenseBox.value).toContain('MIT License');
    expect(licenseBox.value.toLowerCase()).not.toContain('chisel');
    expect(licenseBox.value.toLowerCase()).not.toContain('realtimecsg');
  });

  it('should apply gradient and animation classes for a fancy presentation', () => {
    dialog.show();
    const backdrop = dialog.getBackdropElement();
    const panel = dialog.getPanelElement();
    const title = panel.querySelector('h1') as HTMLElement;
    expect(backdrop.classList.contains('about-dialog-backdrop')).toBe(true);
    expect(panel.classList.contains('about-dialog-panel')).toBe(true);
    expect(title.classList.contains('about-dialog-title')).toBe(true);
    expect(panel.style.background).toContain('linear-gradient');
    expect(document.getElementById('aiworlded-about-dialog-styles')).toBeTruthy();
  });

  it('should close when Escape is pressed while open', () => {
    dialog.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.isOpen()).toBe(false);
  });

  it('should close when the footer Close button is clicked', () => {
    dialog.show();
    const closeButton = findButtonByText(dialog.getPanelElement(), 'Close');
    closeButton?.click();
    expect(dialog.isOpen()).toBe(false);
  });

  it('should remove itself from the host on dispose', () => {
    dialog.show();
    dialog.dispose();
    expect(host.contains(dialog.getBackdropElement())).toBe(false);
    expect(dialog.isOpen()).toBe(false);
  });
});

/**
 * Finds a button under a root whose text content matches exactly.
 *
 * @param root Element tree to search.
 * @param label Exact button label.
 * @returns Matching button or null.
 */
function findButtonByText(root: HTMLElement, label: string): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll('button'));
  return buttons.find((button) => (button.textContent || '').trim() === label) || null;
}

/**
 * Waits for the async contributor fetch to populate spheres in the dialog.
 *
 * @param panel Dialog panel to observe.
 */
async function waitForContributorSpheres(panel: HTMLElement): Promise<void> {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const roll = panel.querySelector('.contributor-roll');
    if (roll && roll.querySelectorAll('.contributor-sphere').length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
