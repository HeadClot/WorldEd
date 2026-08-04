import * as THREE from 'three';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';

/** Convex polygon vertex sort by angle around centroid. */
export class SolidAlgorithmCreateIntersectionLoopsSort {
  /**
   * Sorts vertex indices in place by polar angle around the polygon centroid.
   *
   * @param vertices Hashed vertex table.
   * @param indices Index array (mutated in the [offset, offset+count) range).
   * @param offset Start offset into indices.
   * @param indicesCount Number of indices to sort.
   * @param normal Face normal used to build tangents.
   */
  static sortIndices(
    vertices: HashedVertexTable,
    indices: number[],
    offset: number,
    indicesCount: number,
    normal: THREE.Vector3,
  ): void {
    if (indicesCount < 3) {
      return;
    }
    const { tangentX, tangentY } = this.buildTangents(normal);
    const centroid = this.findPolygonCentroid(vertices, indices, offset, indicesCount);
    const centerX = tangentX.dot(centroid);
    const centerY = tangentY.dot(centroid);
    this.quickSortByAngle(vertices, indices, offset, indicesCount, tangentX, tangentY, centerX, centerY);
  }

  /**
   * Builds stable tangents from a face normal.
   *
   * @param normal Face normal.
   * @returns Orthogonal tangent pair.
   */
  private static buildTangents(normal: THREE.Vector3): {
    tangentX: THREE.Vector3;
    tangentY: THREE.Vector3;
  } {
    const axis = this.pickCrossAxis(normal);
    const tangentX = new THREE.Vector3().crossVectors(normal, axis);
    const tangentY = new THREE.Vector3().crossVectors(normal, tangentX);
    return { tangentX, tangentY };
  }

  /**
   * Picks a world axis least aligned with the normal for cross products.
   *
   * @param normal Face normal.
   * @returns Axis vector.
   */
  private static pickCrossAxis(normal: THREE.Vector3): THREE.Vector3 {
    if (normal.x > normal.y) {
      if (normal.x > normal.z) {
        return new THREE.Vector3(0, 1, 0);
      }
      return new THREE.Vector3(0, 0, 1);
    }
    if (normal.y > normal.z) {
      return new THREE.Vector3(1, 0, 0);
    }
    return new THREE.Vector3(0, 1, 0);
  }

  /**
   * Averages vertex positions for the polygon centroid.
   *
   * @param vertices Vertex table.
   * @param indices Index array.
   * @param offset Start offset.
   * @param indicesCount Count.
   * @returns Centroid.
   */
  private static findPolygonCentroid(
    vertices: HashedVertexTable,
    indices: readonly number[],
    offset: number,
    indicesCount: number,
  ): THREE.Vector3 {
    const centroid = new THREE.Vector3();
    for (let index = 0; index < indicesCount; index++) {
      centroid.add(vertices.get(indices[offset + index]!));
    }
    return centroid.multiplyScalar(1 / indicesCount);
  }

  /**
   * In-place quicksort of indices by atan2 angle.
   *
   * @param vertices Vertex table.
   * @param indices Index array.
   * @param offset Start offset.
   * @param indicesCount Count.
   * @param tangentX Tangent X.
   * @param tangentY Tangent Y.
   * @param centerX Centroid projection X.
   * @param centerY Centroid projection Y.
   */
  private static quickSortByAngle(
    vertices: HashedVertexTable,
    indices: number[],
    offset: number,
    indicesCount: number,
    tangentX: THREE.Vector3,
    tangentY: THREE.Vector3,
    centerX: number,
    centerY: number,
  ): void {
    const sortedStack: Array<{ left: number; right: number }> = [{ left: 0, right: indicesCount - 1 }];
    while (sortedStack.length > 0) {
      const top = sortedStack.pop()!;
      this.partitionAndPush(
        vertices,
        indices,
        offset,
        top.left,
        top.right,
        tangentX,
        tangentY,
        centerX,
        centerY,
        sortedStack,
      );
    }
  }

  /**
   * Partitions one stack range and pushes remaining sub-ranges.
   *
   * @param vertices Vertex table.
   * @param indices Index array.
   * @param offset Base offset.
   * @param l Left bound.
   * @param r Right bound.
   * @param tangentX Tangent X.
   * @param tangentY Tangent Y.
   * @param centerX Center X.
   * @param centerY Center Y.
   * @param sortedStack Stack of remaining ranges.
   */
  private static partitionAndPush(
    vertices: HashedVertexTable,
    indices: number[],
    offset: number,
    l: number,
    r: number,
    tangentX: THREE.Vector3,
    tangentY: THREE.Vector3,
    centerX: number,
    centerY: number,
    sortedStack: Array<{ left: number; right: number }>,
  ): void {
    let left = l;
    let right = r;
    const pivot = vertices.get(indices[offset + Math.floor((left + right) / 2)]!);
    const pivotAngle = Math.atan2(tangentX.dot(pivot) - centerX, tangentY.dot(pivot) - centerY);
    while (true) {
      left = this.advanceLeft(vertices, indices, offset, left, tangentX, tangentY, centerX, centerY, pivotAngle);
      right = this.advanceRight(vertices, indices, offset, right, tangentX, tangentY, centerX, centerY, pivotAngle);
      if (left <= right) {
        if (left !== right) {
          const temp = indices[offset + left]!;
          indices[offset + left] = indices[offset + right]!;
          indices[offset + right] = temp;
        }
        left++;
        right--;
      }
      if (left > right) {
        break;
      }
    }
    if (l < right) {
      sortedStack.push({ left: l, right });
    }
    if (left < r) {
      sortedStack.push({ left, right: r });
    }
  }

  /**
   * Advances left until angle is not greater than pivot.
   *
   * @param vertices Vertex table.
   * @param indices Indices.
   * @param offset Offset.
   * @param left Current left.
   * @param tangentX Tangent X.
   * @param tangentY Tangent Y.
   * @param centerX Center X.
   * @param centerY Center Y.
   * @param pivotAngle Pivot angle.
   * @returns Updated left.
   */
  private static advanceLeft(
    vertices: HashedVertexTable,
    indices: readonly number[],
    offset: number,
    left: number,
    tangentX: THREE.Vector3,
    tangentY: THREE.Vector3,
    centerX: number,
    centerY: number,
    pivotAngle: number,
  ): number {
    let current = left;
    while (true) {
      const vertex = vertices.get(indices[offset + current]!);
      const angle = Math.atan2(tangentX.dot(vertex) - centerX, tangentY.dot(vertex) - centerY);
      if (!(angle > pivotAngle)) {
        return current;
      }
      current++;
    }
  }

  /**
   * Advances right until angle is not less than pivot.
   *
   * @param vertices Vertex table.
   * @param indices Indices.
   * @param offset Offset.
   * @param right Current right.
   * @param tangentX Tangent X.
   * @param tangentY Tangent Y.
   * @param centerX Center X.
   * @param centerY Center Y.
   * @param pivotAngle Pivot angle.
   * @returns Updated right.
   */
  private static advanceRight(
    vertices: HashedVertexTable,
    indices: readonly number[],
    offset: number,
    right: number,
    tangentX: THREE.Vector3,
    tangentY: THREE.Vector3,
    centerX: number,
    centerY: number,
    pivotAngle: number,
  ): number {
    let current = right;
    while (true) {
      const vertex = vertices.get(indices[offset + current]!);
      const angle = Math.atan2(tangentX.dot(vertex) - centerX, tangentY.dot(vertex) - centerY);
      if (!(pivotAngle > angle)) {
        return current;
      }
      current--;
    }
  }
}
