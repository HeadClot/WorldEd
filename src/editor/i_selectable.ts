import type { Vector3 } from 'three';

/** Any object that can be selected in the editor. */
export interface ISelectable {
  /** Whether the object is selected. */
  selected: boolean;

  /** The position of the object in world space. */
  position: Vector3;

  /** General purpose editor variable available to the object with input focus. */
  gpVector1: Vector3;
}
