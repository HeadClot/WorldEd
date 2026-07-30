import { cloneCoordinateSpace, createDefaultCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type { GameProfile } from '@/settings/store/settings_types.js';

/**
 * Deep-clones a game profile object.
 *
 * @param profile Source profile.
 * @returns Cloned profile.
 */
export function cloneProfile(profile: GameProfile): GameProfile {
  return {
    id: profile.id,
    name: profile.name,
    unitSystem: profile.unitSystem,
    metricUnit: profile.metricUnit,
    imperialUnit: profile.imperialUnit,
    coordinateSpace: cloneCoordinateSpace(profile.coordinateSpace ?? createDefaultCoordinateSpace()),
  };
}
