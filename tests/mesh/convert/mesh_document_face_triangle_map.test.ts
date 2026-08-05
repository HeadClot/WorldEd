import { describe, it, expect } from 'vitest';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { meshDocumentFaceIndexFromDisplayTriangle } from '@/mesh/convert/mesh_document_face_triangle_map.js';

describe('meshDocumentFaceIndexFromDisplayTriangle', () => {
  it('maps ear-clip display triangles back to n-gon faces', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 3, 1, 0, 2, 1, 0]);
    const document = meshDocumentFromPolygonList(positions, [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
    expect(meshDocumentFaceIndexFromDisplayTriangle(document, 0)).toBe(0);
    expect(meshDocumentFaceIndexFromDisplayTriangle(document, 1)).toBe(0);
    expect(meshDocumentFaceIndexFromDisplayTriangle(document, 2)).toBe(1);
    expect(meshDocumentFaceIndexFromDisplayTriangle(document, 3)).toBe(1);
    expect(meshDocumentFaceIndexFromDisplayTriangle(document, 4)).toBeNull();
  });
});
