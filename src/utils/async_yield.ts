/**
 * Yields to the browser event loop so the UI can paint (progress bars, input).
 * Prefer requestAnimationFrame so progress updates align with frames.
 *
 * @returns Promise that resolves on the next animation frame (or next
 *   macrotask).
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

/**
 * Runs an async loop over items in batches, yielding between batches.
 *
 * @param itemCount Total items to process.
 * @param batchSize Items per batch before yielding.
 * @param processBatch Called with [startIndex, endIndexExclusive).
 * @param onBatch Optional progress callback after each batch (0..1).
 */
export async function forBatchesAsync(
  itemCount: number,
  batchSize: number,
  processBatch: (startIndex: number, endIndex: number) => void,
  onBatch?: (ratio: number) => void,
): Promise<void> {
  if (itemCount <= 0) {
    onBatch?.(1);
    return;
  }
  const size = Math.max(1, batchSize);
  for (let start = 0; start < itemCount; start += size) {
    const end = Math.min(start + size, itemCount);
    processBatch(start, end);
    onBatch?.(end / itemCount);
    if (end < itemCount) {
      await yieldToBrowser();
    }
  }
}
