import { describe, it, expect } from 'vitest';
import {
  doesElementContainEventTarget,
  isDomNodeLike,
  resolveDocumentFromEventTarget,
} from '@/utils/dom_node_realm.js';

describe('dom_node_realm', () => {
  it('recognizes DOM nodes via nodeType without realm instanceof', () => {
    const element = document.createElement('div');
    expect(isDomNodeLike(element)).toBe(true);
    expect(isDomNodeLike(document)).toBe(true);
    expect(isDomNodeLike({ nodeType: 1 })).toBe(true);
    expect(isDomNodeLike({})).toBe(false);
    expect(isDomNodeLike(null)).toBe(false);
  });

  it('detects containment for detached-document nodes', () => {
    const detachedDocument = document.implementation.createHTMLDocument('detached');
    const surface = detachedDocument.createElement('div');
    const child = detachedDocument.createElement('button');
    surface.appendChild(child);
    expect(doesElementContainEventTarget(surface, child)).toBe(true);
    expect(doesElementContainEventTarget(surface, surface)).toBe(true);
    expect(doesElementContainEventTarget(surface, document.createElement('div'))).toBe(false);
    expect(doesElementContainEventTarget(surface, null)).toBe(false);
  });

  it('resolves documents from event targets without cross-realm instanceof', () => {
    const detachedDocument = document.implementation.createHTMLDocument('detached');
    const child = detachedDocument.createElement('span');
    detachedDocument.body.appendChild(child);
    expect(resolveDocumentFromEventTarget(detachedDocument)).toBe(detachedDocument);
    expect(resolveDocumentFromEventTarget(child)).toBe(detachedDocument);
    expect(resolveDocumentFromEventTarget(null)).toBeNull();
  });
});
