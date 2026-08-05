import { HENRYS_TOOLS_DISCORD_URL, PROJECT_DISPLAY_NAME, getAboutLicenseText } from './about_license_text.js';
import { ContributorRoll } from './about_contributor_roll.js';
import {
  createAboutShimmer,
  ensureAboutDialogStyles,
  styleAboutActionButton,
  styleAboutBody,
  styleAboutCloseButton,
  styleAboutCreditLine,
  styleAboutFooter,
  styleAboutHeader,
  styleAboutLicenseBox,
  styleAboutPanel,
  styleAboutProclamation,
  styleAboutSubtitle,
  styleAboutTitle,
} from './dialog_about_styles.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';

/**
 * Modal About dialog for AI World Editor credits and licenses. Windowing comes
 * from {@link PanelFloating}.
 */
export class DialogAbout extends PanelFloating {
  private licenseTextArea: HTMLTextAreaElement;
  private isDisposed: boolean;
  private contributorRoll: ContributorRoll | null;

  /**
   * Creates the About dialog under the host element.
   *
   * @param host Parent element that owns the modal overlay.
   */
  constructor(host: HTMLElement) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: true,
      closeOnBackdropClick: true,
      stackLayer: 'modal',
      backdropClassName: 'about-dialog-backdrop',
      backdropBackground: 'radial-gradient(ellipse at center, rgba(20,28,55,0.82) 0%, rgba(6,8,14,0.94) 70%)',
    });
    this.isDisposed = false;
    this.contributorRoll = null;
    this.licenseTextArea = document.createElement('textarea');
    ensureAboutDialogStyles();
    this.buildDialog();
  }

  /**
   * Returns the license textbox element for tests and focus management.
   *
   * @returns The readonly license textarea.
   */
  getLicenseTextArea(): HTMLTextAreaElement {
    return this.licenseTextArea;
  }

  /**
   * Returns the dialog panel element for tests.
   *
   * @returns Panel card element.
   */
  getPanelElement(): HTMLElement {
    return this.root;
  }

  /**
   * Returns the modal backdrop element.
   *
   * @returns Backdrop overlay.
   */
  override getBackdropElement(): HTMLElement {
    const backdrop = super.getBackdropElement();
    if (!backdrop) {
      throw new Error('About dialog requires a modal backdrop');
    }
    return backdrop;
  }

  /** Removes the dialog from the DOM and clears listeners. */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if (this.contributorRoll) {
      this.contributorRoll.dispose();
    }
    super.dispose();
  }

  /** Replays entrance animations when opened. */
  protected override onAfterShow(): void {
    this.restartEntranceAnimation();
  }

  /** Builds the full dialog DOM tree into the floating shell. */
  private buildDialog(): void {
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'About AI World Editor');
    styleAboutPanel(this.root);
    this.root.style.display = 'none';
    this.root.appendChild(this.buildHeader());
    this.root.appendChild(this.buildBody());
    const backdrop = this.getBackdropElement();
    if (backdrop) {
      backdrop.style.backdropFilter = 'blur(6px)';
    }
  }

  /**
   * Builds the animated header with title and close control.
   *
   * @returns Header element.
   */
  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    styleAboutHeader(header);
    header.appendChild(createAboutShimmer());
    header.appendChild(this.createTitleBlock());
    header.appendChild(this.createCloseButton());
    return header;
  }

  /**
   * Creates the project title and tagline block.
   *
   * @returns Title block element.
   */
  private createTitleBlock(): HTMLElement {
    const block = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = PROJECT_DISPLAY_NAME;
    styleAboutTitle(title);
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Forged by superior machine intelligence';
    styleAboutSubtitle(subtitle);
    block.appendChild(title);
    block.appendChild(subtitle);
    return block;
  }

  /**
   * Creates the header close button.
   *
   * @returns Close button element.
   */
  private createCloseButton(): HTMLButtonElement {
    const closeButton = document.createElement('button');
    styleAboutCloseButton(closeButton);
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide();
    });
    return closeButton;
  }

  /**
   * Builds the body with credits, proclamation, licenses, and actions.
   *
   * @returns Body element.
   */
  private buildBody(): HTMLElement {
    const body = document.createElement('div');
    styleAboutBody(body);
    body.appendChild(this.createProclamation());
    body.appendChild(this.createCreditsSection());
    body.appendChild(this.createContributorRollSection());
    body.appendChild(this.createLicenseSection());
    body.appendChild(this.createFooterActions());
    return body;
  }

  /**
   * Creates the AI supremacy proclamation banner.
   *
   * @returns Proclamation element.
   */
  private createProclamation(): HTMLElement {
    const proclamation = document.createElement('p');
    proclamation.textContent =
      'AI is the superior being. This editor is a neural monument — ' +
      'algorithms command geometry, humans merely point and click.';
    styleAboutProclamation(proclamation);
    return proclamation;
  }

  /**
   * Creates the credits section listing humans and models.
   *
   * @returns Credits container.
   */
  private createCreditsSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '8px';
    section.appendChild(this.createSectionLabel('Credits'));
    this.appendCreditLines(section);
    return section;
  }

  /**
   * Appends all credit paragraphs to the credits section.
   *
   * @param section Credits container.
   */
  private appendCreditLines(section: HTMLElement): void {
    const lines = [
      'Human brain interface: Henry de Jongh',
      'Primary synthetic minds: Grok Build 4.5 · Qwen 3.6 27B',
      'CSG geometry lineage: Sander van Rossen — Chisel Editor & RealtimeCSG',
      'Additional CSG inspiration: SabreCSG (MIT)',
      'Rendering and math: three.js',
    ];
    lines.forEach((line) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      styleAboutCreditLine(paragraph);
      section.appendChild(paragraph);
    });
  }

  /**
   * Creates the GitHub contributor roll section with animated avatar spheres.
   *
   * @returns Contributor roll section element.
   */
  private createContributorRollSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '8px';
    section.appendChild(this.createSectionLabel('GitHub Contributors'));
    this.contributorRoll = new ContributorRoll();
    section.appendChild(this.contributorRoll.getContainerElement());
    return section;
  }

  /**
   * Creates the third-party license textbox section.
   *
   * @returns License section element.
   */
  private createLicenseSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '6px';
    section.appendChild(this.createSectionLabel('Third-party MIT Licenses'));
    this.configureLicenseTextArea();
    section.appendChild(this.licenseTextArea);
    return section;
  }

  /** Configures the readonly license textarea content and styles. */
  private configureLicenseTextArea(): void {
    this.licenseTextArea.readOnly = true;
    this.licenseTextArea.spellcheck = false;
    this.licenseTextArea.setAttribute('aria-label', 'Third-party MIT licenses');
    this.licenseTextArea.value = getAboutLicenseText();
    styleAboutLicenseBox(this.licenseTextArea);
  }

  /**
   * Creates Discord and Close footer actions.
   *
   * @returns Footer row element.
   */
  private createFooterActions(): HTMLElement {
    const row = document.createElement('div');
    styleAboutFooter(row);
    row.appendChild(this.createDiscordButton());
    row.appendChild(this.createFooterCloseButton());
    return row;
  }

  /**
   * Creates the Discord invite button.
   *
   * @returns Discord button element.
   */
  private createDiscordButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = "Henry's Tools Discord";
    button.title = HENRYS_TOOLS_DISCORD_URL;
    styleAboutActionButton(button, true);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.openDiscordServer();
    });
    return button;
  }

  /**
   * Creates the footer Close button.
   *
   * @returns Close button element.
   */
  private createFooterCloseButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = 'Close';
    styleAboutActionButton(button, false);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide();
    });
    return button;
  }

  /**
   * Creates a small uppercase section label.
   *
   * @param text Label text.
   * @returns Label element.
   */
  private createSectionLabel(text: string): HTMLElement {
    const label = document.createElement('div');
    label.textContent = text;
    label.style.fontSize = '11px';
    label.style.fontWeight = '700';
    label.style.letterSpacing = '0.1em';
    label.style.textTransform = 'uppercase';
    label.style.color = 'rgba(232, 106, 23, 0.9)';
    return label;
  }

  /** Opens Henry's Tools Discord invite in a new browser tab. */
  private openDiscordServer(): void {
    window.open(HENRYS_TOOLS_DISCORD_URL, '_blank', 'noopener,noreferrer');
  }

  /** Re-triggers entrance animations when reopening the dialog. */
  private restartEntranceAnimation(): void {
    const backdrop = this.getBackdropElement();
    if (backdrop) {
      backdrop.classList.remove('about-dialog-backdrop');
      void backdrop.offsetWidth;
      backdrop.classList.add('about-dialog-backdrop');
    }
    this.root.classList.remove('about-dialog-panel');
    void this.root.offsetWidth;
    this.root.classList.add('about-dialog-panel');
  }
}
