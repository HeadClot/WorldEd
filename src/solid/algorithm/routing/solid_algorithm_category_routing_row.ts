import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/** Six destination columns in Chisel CategoryRoutingRow order. */
export const SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH = 6;

/** Invalid destination used by unused operation slots. */
const INVALID = 255;

/**
 * One Chisel CategoryRoutingRow: six destination bytes indexed by relative
 * CategoryIndex (Inside … Outside).
 */
export class SolidAlgorithmCategoryRoutingRow {
  readonly destinations: Uint8Array;

  /**
   * Creates a routing row from six destination values.
   *
   * @param destinations Exactly six category or next-row indices.
   */
  constructor(destinations: Uint8Array | number[]) {
    this.destinations = destinations instanceof Uint8Array ? destinations : Uint8Array.from(destinations);
  }

  /**
   * Returns the destination for one relative category column.
   *
   * @param column CategoryIndex / SurfaceCategory column.
   * @returns Destination byte.
   */
  at(column: number): number {
    return this.destinations[column] ?? SurfaceCategory.Outside;
  }

  /**
   * Returns whether every column stores the same destination.
   *
   * @returns True when all columns match.
   */
  areAllTheSame(): boolean {
    const first = this.destinations[0];
    for (let index = 1; index < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; index++) {
      if (this.destinations[index] !== first) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns whether every column equals the given value.
   *
   * @param value Expected destination.
   * @returns True when all columns equal value.
   */
  areAllValue(value: number): boolean {
    for (let index = 0; index < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; index++) {
      if (this.destinations[index] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns whether this row matches another row byte-for-byte.
   *
   * @param other Other routing row.
   * @returns True when destinations match.
   */
  equals(other: SolidAlgorithmCategoryRoutingRow): boolean {
    for (let index = 0; index < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; index++) {
      if (this.destinations[index] !== other.destinations[index]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Adds a constant offset to every destination (row duplication remap).
   *
   * @param offset Amount added to each column.
   * @returns New routing row.
   */
  plusOffset(offset: number): SolidAlgorithmCategoryRoutingRow {
    const next = new Uint8Array(SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH);
    for (let index = 0; index < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; index++) {
      next[index] = (this.destinations[index]! + offset) & 0xff;
    }
    return new SolidAlgorithmCategoryRoutingRow(next);
  }

  /**
   * Bakes a CSG operation between a left category and each column of a right
   * row (final Combine step in CreateRoutingTableJob).
   *
   * @param operationIndex SolidOperation ordinal used as table bank.
   * @param leftCategory Left accumulated CategoryIndex.
   * @param right Right-node routing row.
   * @returns Operation-baked routing row.
   */
  static fromOperation(
    operationIndex: number,
    leftCategory: number,
    right: SolidAlgorithmCategoryRoutingRow,
  ): SolidAlgorithmCategoryRoutingRow {
    const operationOffset = operationIndex * OPERATION_STRIDE;
    const row = leftCategory * ROW_STRIDE;
    const next = new Uint8Array(SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH);
    for (let column = 0; column < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; column++) {
      const rightCategory = right.destinations[column]!;
      next[column] = OPERATION_TABLES[operationOffset + row + rightCategory]!;
    }
    return new SolidAlgorithmCategoryRoutingRow(next);
  }

  /** Identity row: each input column maps to itself. */
  static readonly Identity = new SolidAlgorithmCategoryRoutingRow([
    SurfaceCategory.Inside,
    SurfaceCategory.Aligned,
    SurfaceCategory.SelfAligned,
    SurfaceCategory.SelfReverseAligned,
    SurfaceCategory.ReverseAligned,
    SurfaceCategory.Outside,
  ]);

  /** All destinations invalid. */
  static readonly AllInvalid = new SolidAlgorithmCategoryRoutingRow([
    INVALID,
    INVALID,
    INVALID,
    INVALID,
    INVALID,
    INVALID,
  ]);

  /** All destinations SelfAligned. */
  static readonly AllSelfAligned = new SolidAlgorithmCategoryRoutingRow([
    SurfaceCategory.SelfAligned,
    SurfaceCategory.SelfAligned,
    SurfaceCategory.SelfAligned,
    SurfaceCategory.SelfAligned,
    SurfaceCategory.SelfAligned,
    SurfaceCategory.SelfAligned,
  ]);

  /** All destinations SelfReverseAligned. */
  static readonly AllSelfReverseAligned = new SolidAlgorithmCategoryRoutingRow([
    SurfaceCategory.SelfReverseAligned,
    SurfaceCategory.SelfReverseAligned,
    SurfaceCategory.SelfReverseAligned,
    SurfaceCategory.SelfReverseAligned,
    SurfaceCategory.SelfReverseAligned,
    SurfaceCategory.SelfReverseAligned,
  ]);

  /** All destinations Outside. */
  static readonly AllOutside = new SolidAlgorithmCategoryRoutingRow([
    SurfaceCategory.Outside,
    SurfaceCategory.Outside,
    SurfaceCategory.Outside,
    SurfaceCategory.Outside,
    SurfaceCategory.Outside,
    SurfaceCategory.Outside,
  ]);

  /** All destinations Inside. */
  static readonly AllInside = new SolidAlgorithmCategoryRoutingRow([
    SurfaceCategory.Inside,
    SurfaceCategory.Inside,
    SurfaceCategory.Inside,
    SurfaceCategory.Inside,
    SurfaceCategory.Inside,
    SurfaceCategory.Inside,
  ]);
}

/**
 * Resolves the operation bank index for Combine (HAVE_SELF_CATEGORIES path).
 *
 * @param operation Child CSG operation.
 * @returns Operation table bank index.
 */
export function solidAlgorithmOperationTableIndex(operation: SolidOperation): number {
  return operation as number;
}

const Inside = SurfaceCategory.Inside;
const Aligned = SurfaceCategory.Aligned;
const SelfAligned = SurfaceCategory.SelfAligned;
const SelfReverseAligned = SurfaceCategory.SelfReverseAligned;
const ReverseAligned = SurfaceCategory.ReverseAligned;
const Outside = SurfaceCategory.Outside;

/**
 * Exact Chisel kOperationTables with HAVE_SELF_CATEGORIES (Additive,
 * Subtractive, Intersecting, unused AdditiveKeepInside).
 */
const OPERATION_TABLES: readonly number[] = [
  Inside,
  Inside,
  Inside,
  Inside,
  Inside,
  Inside,
  Inside,
  Aligned,
  SelfAligned,
  Inside,
  Inside,
  Aligned,
  Inside,
  Aligned,
  SelfAligned,
  Inside,
  Inside,
  SelfAligned,
  Inside,
  Inside,
  Inside,
  SelfReverseAligned,
  ReverseAligned,
  SelfReverseAligned,
  Inside,
  Inside,
  Inside,
  SelfReverseAligned,
  ReverseAligned,
  ReverseAligned,
  Inside,
  Aligned,
  SelfAligned,
  SelfReverseAligned,
  ReverseAligned,
  Outside,
  Outside,
  ReverseAligned,
  SelfReverseAligned,
  SelfAligned,
  Aligned,
  Inside,
  Outside,
  Outside,
  Outside,
  Aligned,
  Aligned,
  Aligned,
  Outside,
  Outside,
  Outside,
  Aligned,
  Aligned,
  SelfAligned,
  Outside,
  ReverseAligned,
  SelfReverseAligned,
  Outside,
  Outside,
  SelfReverseAligned,
  Outside,
  ReverseAligned,
  SelfReverseAligned,
  Outside,
  Outside,
  ReverseAligned,
  Outside,
  Outside,
  Outside,
  Outside,
  Outside,
  Outside,
  Inside,
  Aligned,
  SelfAligned,
  SelfReverseAligned,
  ReverseAligned,
  Outside,
  Aligned,
  Aligned,
  SelfAligned,
  Outside,
  Outside,
  Outside,
  SelfAligned,
  Aligned,
  SelfAligned,
  Outside,
  Outside,
  Outside,
  SelfReverseAligned,
  Outside,
  Outside,
  SelfReverseAligned,
  ReverseAligned,
  Outside,
  ReverseAligned,
  Outside,
  Outside,
  SelfReverseAligned,
  ReverseAligned,
  Outside,
  Outside,
  Outside,
  Outside,
  Outside,
  Outside,
  Outside,
  Outside,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
  INVALID,
];

const OPERATION_COUNT = 6;
const ROW_STRIDE = OPERATION_COUNT;
const OPERATION_STRIDE = OPERATION_COUNT * ROW_STRIDE;
