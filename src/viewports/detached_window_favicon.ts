/** One favicon candidate copied from the opener into the popup document. */
export type FaviconLinkSpec = {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
};

/**
 * Applies favicon link elements on a popup document with JavaScript (the same
 * approach sites use to change tab icons for notifications). Static tags in
 * about:blank document.write HTML are often ignored by the browser chrome.
 *
 * @param targetDocument Popup document that should show the app icon.
 * @param sourceDocument Opener document that already has working favicon links.
 */
export function applyDetachedWindowFavicon(targetDocument: Document, sourceDocument: Document = document): void {
  const head = resolveDocumentHead(targetDocument);
  if (!head) return;
  clearFaviconLinks(head);
  const specs = collectFaviconLinkSpecs(sourceDocument);
  const effective = specs.length > 0 ? specs : buildFallbackFaviconSpecs(sourceDocument);
  for (const spec of effective) {
    head.appendChild(createFaviconLinkElement(targetDocument, spec));
  }
}

/**
 * Re-applies the primary favicon as a data URL so about:blank does not depend
 * on fetching a same-origin path from a blank document context.
 *
 * @param targetDocument Popup document whose icon should be embedded.
 * @param sourceDocument Opener document used to resolve the source icon URL.
 * @returns Promise that settles after the icon is applied or skipped.
 */
export async function embedDetachedWindowFaviconDataUrl(
  targetDocument: Document,
  sourceDocument: Document = document,
): Promise<void> {
  const head = resolveDocumentHead(targetDocument);
  if (!head) return;
  const sourceHref = resolvePrimaryFaviconHref(sourceDocument);
  if (!sourceHref) return;
  const dataUrl = await fetchIconAsDataUrl(sourceHref);
  if (!dataUrl) return;
  clearFaviconLinks(head);
  const link = createFaviconLinkElement(targetDocument, { rel: 'icon', href: dataUrl });
  head.appendChild(link);
  // Some engines only refresh the window glyph when href is assigned after attach.
  link.setAttribute('href', dataUrl);
}

/**
 * Collects absolute favicon hrefs already declared on a document.
 *
 * @param sourceDocument Document that may contain link[rel=icon] tags.
 * @returns Favicon specs with absolute hrefs.
 */
export function collectFaviconLinkSpecs(sourceDocument: Document): FaviconLinkSpec[] {
  const nodes = sourceDocument.querySelectorAll(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  );
  const specs: FaviconLinkSpec[] = [];
  for (const node of Array.from(nodes)) {
    const spec = readFaviconLinkSpec(node as HTMLLinkElement);
    if (spec) specs.push(spec);
  }
  return specs;
}

/**
 * Reads one favicon link into a portable spec with an absolute href.
 *
 * @param link Source link element.
 * @returns Spec, or null when href is missing.
 */
function readFaviconLinkSpec(link: HTMLLinkElement): FaviconLinkSpec | null {
  const href = link.href || link.getAttribute('href') || '';
  if (!href) return null;
  const sizesValue = link.sizes?.toString?.() || link.getAttribute('sizes') || '';
  const spec: FaviconLinkSpec = {
    rel: link.rel || 'icon',
    href,
  };
  if (link.type) {
    spec.type = link.type;
  }
  if (sizesValue) {
    spec.sizes = sizesValue;
  }
  return spec;
}

/**
 * Builds a default favicon.ico URL from the opener location when head has none.
 *
 * @param sourceDocument Opener document (uses defaultView.location).
 * @returns Single fallback icon spec list.
 */
function buildFallbackFaviconSpecs(sourceDocument: Document): FaviconLinkSpec[] {
  const href = resolveDefaultFaviconHref(sourceDocument);
  return href ? [{ rel: 'icon', href }] : [];
}

/**
 * Picks the best absolute favicon URL from the opener document.
 *
 * @param sourceDocument Opener document.
 * @returns Absolute href, or null when none can be resolved.
 */
function resolvePrimaryFaviconHref(sourceDocument: Document): string | null {
  const specs = collectFaviconLinkSpecs(sourceDocument);
  if (specs.length > 0) return specs[0]!.href;
  return resolveDefaultFaviconHref(sourceDocument);
}

/**
 * Resolves favicon.ico next to the opener page.
 *
 * @param sourceDocument Opener document.
 * @returns Absolute favicon.ico URL, or null.
 */
function resolveDefaultFaviconHref(sourceDocument: Document): string | null {
  const locationHref = sourceDocument.defaultView?.location?.href ?? '';
  if (!locationHref) return null;
  try {
    return new URL('favicon.ico', locationHref).href;
  } catch {
    return null;
  }
}

/**
 * Fetches an icon URL and encodes it as a data URL.
 *
 * @param iconHref Absolute icon URL.
 * @returns Data URL string, or null on failure.
 */
async function fetchIconAsDataUrl(iconHref: string): Promise<string | null> {
  try {
    const response = await fetch(iconHref);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await readBlobAsDataUrl(blob);
  } catch {
    return null;
  }
}

/**
 * Reads a Blob as a data URL via FileReader.
 *
 * @param blob Icon binary payload.
 * @returns Data URL promise.
 */
function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read icon blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Creates a link[rel=icon] element for the target document.
 *
 * @param targetDocument Popup document that owns the element.
 * @param spec Rel/href and optional type/sizes.
 * @returns Configured link element.
 */
function createFaviconLinkElement(targetDocument: Document, spec: FaviconLinkSpec): HTMLLinkElement {
  const link = targetDocument.createElement('link');
  link.rel = spec.rel;
  if (spec.type) link.type = spec.type;
  if (spec.sizes) link.setAttribute('sizes', spec.sizes);
  link.href = spec.href;
  return link;
}

/**
 * Removes existing favicon-related link tags from a head element.
 *
 * @param head Document head to clean.
 */
function clearFaviconLinks(head: HTMLHeadElement): void {
  const existing = head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  for (const node of Array.from(existing)) {
    node.remove();
  }
}

/**
 * Returns the document head, creating one only when the tree is writable.
 *
 * @param targetDocument Document that should expose a head element.
 * @returns Head element or null.
 */
function resolveDocumentHead(targetDocument: Document): HTMLHeadElement | null {
  if (targetDocument.head) return targetDocument.head;
  const created = targetDocument.createElement('head');
  const root = targetDocument.documentElement;
  if (!root) return null;
  root.insertBefore(created, root.firstChild);
  return created;
}
