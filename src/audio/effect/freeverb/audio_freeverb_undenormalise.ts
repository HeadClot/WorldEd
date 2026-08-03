/** Shared float bits for classic Freeverb denormal detection. */
const FLOAT_BITS = new Float32Array(1);
const FLOAT_BITS_AS_UINT = new Uint32Array(FLOAT_BITS.buffer);

/**
 * Clears IEEE-754 float32 denormals exactly as Freeverb undenormalise does.
 *
 * @param sample Input sample that may be denormal.
 * @returns Zero when the float32 exponent bits are all clear, else sample.
 */
export function freeverbUndenormalise(sample: number): number {
  FLOAT_BITS[0] = sample;
  if ((FLOAT_BITS_AS_UINT[0]! & 0x7f800000) === 0) {
    return 0;
  }
  return sample;
}
