import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContributorRoll } from '../../../src/ui/about/about_contributor_roll.js';
import * as fetcher from '../../../src/ui/about/about_contributor_fetcher.js';

describe('ContributorRoll', () => {
  let roll: ContributorRoll;
  const mockContributors = [
    {
      login: 'alice',
      avatarUrl: 'https://avatars.githubusercontent.com/alice',
      profileUrl: 'https://github.com/alice',
      contributions: 100,
      displayName: 'Alice Dev',
    },
    {
      login: 'bob',
      avatarUrl: 'https://avatars.githubusercontent.com/bob',
      profileUrl: 'https://github.com/bob',
      contributions: 50,
      displayName: 'Bob Builder',
    },
  ];

  beforeEach(() => {
    vi.spyOn(fetcher, 'fetchGitHubContributors').mockResolvedValue(mockContributors);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a container element with flex layout', async () => {
    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    expect(container).toBeInstanceOf(HTMLElement);
    expect(container.className).toBe('contributor-roll');
    expect(container.style.display).toBe('flex');

    await waitForSpheresToRender(container);
    const spheres = container.querySelectorAll('.contributor-sphere');
    expect(spheres.length).toBe(2);
  });

  it('should create spheres with avatar images for each contributor', async () => {
    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    await waitForSpheresToRender(container);
    const spheres = container.querySelectorAll('.contributor-sphere');

    const images = container.querySelectorAll('img');
    expect(images.length).toBe(2);

    expect(images[0].src).toBe('https://avatars.githubusercontent.com/alice');
    expect(images[0].alt).toBe('Alice Dev');
    expect(images[1].src).toBe('https://avatars.githubusercontent.com/bob');
    expect(images[1].alt).toBe('Bob Builder');
  });

  it('should set tooltip with display name on each sphere', async () => {
    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    await waitForSpheresToRender(container);
    const spheres = container.querySelectorAll('.contributor-sphere');

    expect(spheres[0].title).toBe('Alice Dev');
    expect(spheres[1].title).toBe('Bob Builder');
  });

  it('should open contributor profile on sphere click', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    await waitForSpheresToRender(container);
    const spheres = container.querySelectorAll('.contributor-sphere');

    spheres[0].dispatchEvent(new PointerEvent('click', { bubbles: true }));
    expect(openSpy).toHaveBeenCalledWith('https://github.com/alice', '_blank', 'noopener,noreferrer');

    spheres[1].dispatchEvent(new PointerEvent('click', { bubbles: true }));
    expect(openSpy).toHaveBeenCalledWith('https://github.com/bob', '_blank', 'noopener,noreferrer');

    openSpy.mockRestore();
  });

  it('should apply roll-in animation with staggered delays', async () => {
    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    await waitForSpheresToRender(container);
    const spheres = container.querySelectorAll('.contributor-sphere');

    const anim0 = spheres[0].style.animation;
    const anim1 = spheres[1].style.animation;

    expect(anim0).toContain('contributorSphereRollIn');
    expect(anim0).toContain(' 0ms ');
    expect(anim1).toContain('contributorSphereRollIn');
    expect(anim1).not.toContain(' 0ms ');
  });

  it('should limit the number of visible spheres', async () => {
    const manyContributors = Array.from({ length: 20 }, (_, i) => ({
      login: `user${i}`,
      avatarUrl: `https://avatars.githubusercontent.com/user${i}`,
      profileUrl: `https://github.com/user${i}`,
      contributions: i + 1,
      displayName: `User ${i}`,
    }));

    vi.spyOn(fetcher, 'fetchGitHubContributors').mockResolvedValue(manyContributors);

    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    await waitForSpheresToRender(container);
    const spheres = container.querySelectorAll('.contributor-sphere');
    expect(spheres.length).toBe(10);
  });

  it('should handle empty contributor list gracefully', async () => {
    vi.spyOn(fetcher, 'fetchGitHubContributors').mockResolvedValue([]);

    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    await waitForSpheresToRender(container);
    const spheres = container.querySelectorAll('.contributor-sphere');
    expect(spheres.length).toBe(0);
  });

  it('should dispose and clear the container', async () => {
    roll = new ContributorRoll();
    const container = roll.getContainerElement();

    await waitForSpheresToRender(container);
    expect(container.children.length).toBe(2);

    roll.dispose();
    expect(container.innerHTML).toBe('');
  });
});

/**
 * Waits for the asynchronous contributor fetch to populate the container.
 *
 * @param container Element to observe for sphere children.
 */
async function waitForSpheresToRender(container: HTMLElement): Promise<void> {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    if (container.querySelectorAll('.contributor-sphere').length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
