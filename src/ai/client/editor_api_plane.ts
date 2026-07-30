import * as THREE from 'three';
import type { McpVec3 } from '@/ai/shared/mcp_protocol_types.js';
import { dtoToVec3 } from './editor_api_math.js';

/** Plane arguments shared by clip and split tools. */
export interface BrushPlaneArgs {
  /** Axis-aligned plane: axis and world distance along that axis. */
  axis?: 'x' | 'y' | 'z';
  /** World position of the axis-aligned plane (e.g. cut at x=distance). */
  distance?: number;
  /** Free plane: a point on the plane (with normal). */
  point?: McpVec3;
  /** Free plane: world normal (with point). */
  normal?: McpVec3;
  /** Three-point plane (right-hand winding defines keep-front normal). */
  pointA?: McpVec3;
  pointB?: McpVec3;
  pointC?: McpVec3;
}

/**
 * Builds a world-space Three.js plane from AI-friendly arguments.
 *
 * @param args Plane definition (axis+distance, point+normal, or three points).
 * @returns World plane, or null when args are incomplete/invalid.
 */
export function buildWorldClipPlane(args: BrushPlaneArgs): THREE.Plane | null {
  if (args.axis && typeof args.distance === 'number' && Number.isFinite(args.distance)) {
    return buildAxisAlignedPlane(args.axis, args.distance);
  }
  if (args.point && args.normal) {
    return buildPointNormalPlane(args.point, args.normal);
  }
  if (args.pointA && args.pointB && args.pointC) {
    return buildThreePointPlane(args.pointA, args.pointB, args.pointC);
  }
  return null;
}

/**
 * Builds an axis-aligned world plane at a constant coordinate.
 *
 * @param axis World axis.
 * @param distance Coordinate value along that axis.
 * @returns World plane with positive normal along the axis.
 */
function buildAxisAlignedPlane(axis: 'x' | 'y' | 'z', distance: number): THREE.Plane {
  const normal = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  const point = new THREE.Vector3(
    axis === 'x' ? distance : 0,
    axis === 'y' ? distance : 0,
    axis === 'z' ? distance : 0,
  );
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
}

/**
 * Builds a plane from a point and normal.
 *
 * @param pointDto Point on the plane.
 * @param normalDto Plane normal.
 * @returns World plane, or null when normal is degenerate.
 */
function buildPointNormalPlane(pointDto: McpVec3, normalDto: McpVec3): THREE.Plane | null {
  const normal = dtoToVec3(normalDto, new THREE.Vector3()).normalize();
  if (normal.lengthSq() < 1e-12) return null;
  const point = dtoToVec3(pointDto, new THREE.Vector3());
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
}

/**
 * Builds a plane from three coplanar points.
 *
 * @param a First point.
 * @param b Second point.
 * @param c Third point.
 * @returns World plane, or null when points are colinear.
 */
function buildThreePointPlane(a: McpVec3, b: McpVec3, c: McpVec3): THREE.Plane | null {
  const pointA = dtoToVec3(a, new THREE.Vector3());
  const pointB = dtoToVec3(b, new THREE.Vector3());
  const pointC = dtoToVec3(c, new THREE.Vector3());
  const plane = new THREE.Plane().setFromCoplanarPoints(pointA, pointB, pointC);
  if (plane.normal.lengthSq() < 1e-12) return null;
  return plane;
}

/**
 * Describes the plane definition mode for tool error messages.
 *
 * @returns Help string for invalid plane args.
 */
export function planeArgsHelpMessage(): string {
  return 'Provide axis+distance, or point+normal, or pointA+pointB+pointC';
}
