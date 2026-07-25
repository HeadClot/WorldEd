/**
 * Walks a sorted peer-index list plus the subject index in ascending prepared
 * order so CSG local routing and membership use the same evaluation sequence.
 *
 * @param sortedPeers Sorted overlapping peer indices (no subject).
 * @param subjectIndex Subject brush prepared index.
 * @param visit Callback for each index in order.
 */
export function forEachSubjectAndPeersInOrder(
  sortedPeers: readonly number[],
  subjectIndex: number,
  visit: (index: number) => void,
): void {
  let insertedSelf = false;
  for (const peerIndex of sortedPeers) {
    if (!insertedSelf && subjectIndex < peerIndex) {
      visit(subjectIndex);
      insertedSelf = true;
    }
    visit(peerIndex);
  }
  if (!insertedSelf) {
    visit(subjectIndex);
  }
}
