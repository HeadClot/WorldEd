import { GithubContributorInfo, fetchGitHubContributors } from './about_contributor_fetcher.js';

const SPHERE_SIZE = 44;

const ANIMATION_DELAY_STEP = 80;

const MAX_VISIBLE = 10;

/**
 * Builds the contributor roll section with animated spheres for the About
 * dialog. Spheres roll in from right to left, display avatars, show tooltips,
 * and link to GitHub profiles on click.
 */
export class ContributorRoll {
  private container: HTMLElement;
  private isDisposed: boolean;

  /** Creates the contributor roll container and begins fetching data. */
  constructor() {
    this.container = document.createElement('div');
    this.isDisposed = false;
    this.buildContainer();
    this.populateContributors();
  }

  /**
   * Returns the root container element.
   *
   * @returns Container element for insertion into the About dialog.
   */
  getContainerElement(): HTMLElement {
    return this.container;
  }

  /** Removes all event listeners and clears the container. */
  dispose(): void {
    this.isDisposed = true;
    this.container.innerHTML = '';
  }

  /** Builds the container element with layout styles. */
  private buildContainer(): void {
    this.container.className = 'contributor-roll';
    this.container.style.display = 'flex';
    this.container.style.flexWrap = 'wrap';
    this.container.style.gap = '8px';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'center';
    this.container.style.minHeight = `${SPHERE_SIZE + 8}px`;
  }

  /** Fetches contributors from GitHub and populates the roll. */
  private async populateContributors(): Promise<void> {
    const contributors = await fetchGitHubContributors();
    if (this.isDisposed) return;
    this.buildSphereElements(contributors);
  }

  /**
   * Creates sphere elements for each contributor.
   *
   * @param contributors Array of contributor data.
   */
  private buildSphereElements(contributors: GithubContributorInfo[]): void {
    const limited = contributors.slice(0, MAX_VISIBLE);

    limited.forEach((contributor, index) => {
      const sphere = this.createSphere(contributor, index);
      this.container.appendChild(sphere);
    });

    if (limited.length === 0) {
      this.container.style.minHeight = '0px';
      this.container.style.padding = '0';
    }
  }

  /**
   * Creates a single sphere element for a contributor.
   *
   * @param contributor Contributor data.
   * @param index Position index for animation stagger.
   * @returns Sphere element with image, tooltip, and click handler.
   */
  private createSphere(contributor: GithubContributorInfo, index: number): HTMLElement {
    const sphere = document.createElement('div');
    sphere.className = 'contributor-sphere';
    sphere.style.width = `${SPHERE_SIZE}px`;
    sphere.style.height = `${SPHERE_SIZE}px`;
    sphere.style.borderRadius = '50%';
    sphere.style.cursor = 'pointer';
    sphere.style.flexShrink = '0';
    sphere.style.position = 'relative';
    sphere.style.overflow = 'hidden';
    sphere.style.border = '2px solid rgba(232, 106, 23, 0.5)';
    sphere.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.4)';
    sphere.style.transform = 'translateX(80px) scale(0.3)';
    sphere.style.opacity = '0';
    sphere.style.animation = `contributorSphereRollIn 0.6s ${
      index * ANIMATION_DELAY_STEP
    }ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
    sphere.title = contributor.displayName;
    sphere.setAttribute('role', 'link');
    sphere.setAttribute('aria-label', contributor.displayName);

    const sphereImage = document.createElement('img');
    sphereImage.src = contributor.avatarUrl;
    sphereImage.alt = contributor.displayName;
    sphereImage.style.width = '100%';
    sphereImage.style.height = '100%';
    sphereImage.style.borderRadius = '50%';
    sphereImage.style.display = 'block';
    sphereImage.style.pointerEvents = 'none';
    sphereImage.style.objectFit = 'cover';

    sphere.addEventListener('click', () => {
      this.openContributorProfile(contributor.profileUrl);
    });

    sphere.addEventListener('mouseenter', () => {
      sphere.style.transform = 'scale(1.15)';
      sphere.style.borderColor = 'rgba(232, 106, 23, 0.9)';
      sphere.style.boxShadow = '0 0 14px rgba(232, 106, 23, 0.45), 0 2px 12px rgba(0, 0, 0, 0.5)';
      sphere.style.transition = 'transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease';
    });

    sphere.addEventListener('mouseleave', () => {
      sphere.style.transform = 'scale(1)';
      sphere.style.borderColor = 'rgba(232, 106, 23, 0.5)';
      sphere.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.4)';
    });

    sphere.appendChild(sphereImage);
    return sphere;
  }

  /**
   * Opens the contributor's GitHub profile in a new browser tab.
   *
   * @param url Profile URL to open.
   */
  private openContributorProfile(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
