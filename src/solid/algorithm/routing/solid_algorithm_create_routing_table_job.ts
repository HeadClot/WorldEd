import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidAlgorithmCategoryRoutingRow } from './solid_algorithm_category_routing_row.js';
import { SolidAlgorithmCategoryStackNode } from './solid_algorithm_category_stack_node.js';
import type { SolidAlgorithmCompactNode } from './solid_algorithm_compact_node.js';
import {
  SolidAlgorithmBrushesTouched,
  solidAlgorithmMarkInfiniteBrushTouch,
} from './solid_algorithm_brushes_touched.js';
import { SolidAlgorithmCreateRoutingTableCombine } from './solid_algorithm_create_routing_table_combine.js';
import { SolidAlgorithmIntersectionType } from './solid_algorithm_intersection_type.js';
import { SolidAlgorithmRoutingLookup } from './solid_algorithm_routing_lookup.js';
import { SolidAlgorithmRoutingTable } from './solid_algorithm_routing_table.js';

/** Event kinds for the CreateRoutingTableJob walk queue. */
enum QueuedEventType {
  GetStackNode = 0,
  Combine = 1,
  ListItem = 2,
}

/** One deferred walk event (Chisel QueuedEvent). */
interface QueuedEvent {
  type: QueuedEventType;
  currIndex: number;
  leftHaveGoneBeyondSelf: number;
  intersectionType: SolidAlgorithmIntersectionType;
  outputStartIndex: number;
  leftStackStartIndex: number;
  rightStackStartIndex: number;
}

/**
 * Exact port of Chisel CreateRoutingTableJob: builds CategoryStackNode routing
 * tables via GetStackNode / ListItem / Combine over the compact hierarchy.
 */
export class SolidAlgorithmCreateRoutingTableJob {
  /**
   * Builds a routing table for one subject brush.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy (root at 0).
   * @param invertedWorld Inverted-world flag.
   * @param boundsPad Bounds pad for touch tests.
   * @param membershipEpsilon Plane epsilon.
   * @returns Routing table for the subject.
   */
  static buildForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    invertedWorld: boolean,
    boundsPad: number,
    membershipEpsilon: number,
  ): SolidAlgorithmRoutingTable {
    const subject = prepared[subjectIndex];
    if (!subject || hierarchy.length === 0) {
      return SolidAlgorithmRoutingTable.empty(invertedWorld);
    }
    const touched = SolidAlgorithmBrushesTouched.buildForSubject(
      prepared,
      subjectIndex,
      hierarchy,
      boundsPad,
      membershipEpsilon,
    );
    solidAlgorithmMarkInfiniteBrushTouch(hierarchy, touched);
    const subjectNodeId = this.findSubjectNodeId(hierarchy, subjectIndex);
    if (subjectNodeId < 0) {
      return SolidAlgorithmRoutingTable.empty(invertedWorld);
    }
    const stack = this.getStackNodes(subjectNodeId, touched, hierarchy);
    return this.buildTableFromStack(stack, hierarchy, invertedWorld);
  }

  /**
   * Finds the compact node id for the subject prepared index.
   *
   * @param hierarchy Compact hierarchy.
   * @param subjectIndex Subject prepared index.
   * @returns Node id, or -1 when missing.
   */
  private static findSubjectNodeId(hierarchy: readonly SolidAlgorithmCompactNode[], subjectIndex: number): number {
    for (const node of hierarchy) {
      if (node.kind === 'brush' && node.preparedIndex === subjectIndex) {
        return node.nodeId;
      }
    }
    return -1;
  }

  /**
   * Builds the CategoryStackNode array for the processed subject.
   *
   * @param processedNodeId Subject compact node id.
   * @param touched Touch map.
   * @param hierarchy Compact hierarchy.
   * @returns Live stack nodes.
   */
  private static getStackNodes(
    processedNodeId: number,
    touched: SolidAlgorithmBrushesTouched,
    hierarchy: readonly SolidAlgorithmCompactNode[],
  ): SolidAlgorithmCategoryStackNode[] {
    const output: SolidAlgorithmCategoryStackNode[] = [];
    const events: QueuedEvent[] = [];
    let haveGoneBeyondSelf = 0;
    let outputLength = 0;
    events.push(this.makeGetStackNode(0, 0, touched.get(hierarchy[0]!.nodeId)));
    while (events.length > 0) {
      const currEvent = events.pop()!;
      if (currEvent.type === QueuedEventType.GetStackNode) {
        outputLength = this.handleGetStackNode(
          currEvent,
          processedNodeId,
          touched,
          hierarchy,
          output,
          outputLength,
          events,
          (value) => {
            haveGoneBeyondSelf = value;
          },
          () => haveGoneBeyondSelf,
        );
        continue;
      }
      if (currEvent.type === QueuedEventType.ListItem) {
        this.handleListItem(currEvent, outputLength, events, haveGoneBeyondSelf);
        continue;
      }
      outputLength = this.handleCombine(currEvent, hierarchy, output, outputLength, haveGoneBeyondSelf);
    }
    if (outputLength === 0) {
      output.push(new SolidAlgorithmCategoryStackNode(0, processedNodeId, SolidAlgorithmCategoryRoutingRow.AllOutside));
      outputLength = 1;
    }
    return output.slice(0, outputLength);
  }

  /**
   * Handles a GetStackNode event.
   *
   * @param currEvent Event data.
   * @param processedNodeId Subject node id.
   * @param touched Touch map.
   * @param hierarchy Compact hierarchy.
   * @param output Output stack.
   * @param outputLength Current length.
   * @param events Event queue.
   * @param setBeyondSelf Setter for haveGoneBeyondSelf.
   * @param getBeyondSelf Getter for haveGoneBeyondSelf.
   * @returns Updated output length.
   */
  private static handleGetStackNode(
    currEvent: QueuedEvent,
    processedNodeId: number,
    touched: SolidAlgorithmBrushesTouched,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    output: SolidAlgorithmCategoryStackNode[],
    outputLength: number,
    events: QueuedEvent[],
    setBeyondSelf: (value: number) => void,
    getBeyondSelf: () => number,
  ): number {
    const intersectionType = currEvent.intersectionType;
    if (
      intersectionType === SolidAlgorithmIntersectionType.NoIntersection ||
      intersectionType === SolidAlgorithmIntersectionType.InvalidValue
    ) {
      return outputLength;
    }
    const currentNode = hierarchy[currEvent.currIndex];
    if (!currentNode) {
      return outputLength;
    }
    if (currentNode.kind === 'brush') {
      return this.handleGetStackBrush(
        currentNode,
        processedNodeId,
        intersectionType,
        output,
        outputLength,
        setBeyondSelf,
        getBeyondSelf,
      );
    }
    return this.handleGetStackBranch(currentNode, currEvent, touched, hierarchy, output, outputLength, events);
  }

  /**
   * Emits a brush shortcut or identity row for GetStackNode.
   *
   * @param currentNode Brush node.
   * @param processedNodeId Subject node id.
   * @param intersectionType Touch type.
   * @param output Output stack.
   * @param outputLength Current length.
   * @param setBeyondSelf Beyond-self setter.
   * @param getBeyondSelf Beyond-self getter.
   * @returns Updated output length.
   */
  private static handleGetStackBrush(
    currentNode: SolidAlgorithmCompactNode,
    processedNodeId: number,
    intersectionType: SolidAlgorithmIntersectionType,
    output: SolidAlgorithmCategoryStackNode[],
    outputLength: number,
    setBeyondSelf: (value: number) => void,
    getBeyondSelf: () => number,
  ): number {
    if (intersectionType === SolidAlgorithmIntersectionType.AInsideB) {
      output[outputLength] = new SolidAlgorithmCategoryStackNode(
        0,
        currentNode.nodeId,
        SolidAlgorithmCategoryRoutingRow.AllInside,
      );
      return outputLength + 1;
    }
    if (intersectionType === SolidAlgorithmIntersectionType.BInsideA) {
      output[outputLength] = new SolidAlgorithmCategoryStackNode(
        0,
        currentNode.nodeId,
        SolidAlgorithmCategoryRoutingRow.AllOutside,
      );
      return outputLength + 1;
    }
    if (processedNodeId === currentNode.nodeId) {
      setBeyondSelf(1);
      output[outputLength] = new SolidAlgorithmCategoryStackNode(
        0,
        currentNode.nodeId,
        SolidAlgorithmCategoryRoutingRow.AllSelfAligned,
      );
      return outputLength + 1;
    }
    if (getBeyondSelf() > 0) {
      setBeyondSelf(2);
    }
    output[outputLength] = new SolidAlgorithmCategoryStackNode(
      0,
      currentNode.nodeId,
      SolidAlgorithmCategoryRoutingRow.Identity,
    );
    return outputLength + 1;
  }

  /**
   * Queues child GetStackNode / ListItem events for a branch.
   *
   * @param currentNode Branch node.
   * @param currEvent Parent GetStackNode event.
   * @param touched Touch map.
   * @param hierarchy Compact hierarchy.
   * @param output Output stack.
   * @param outputLength Current length.
   * @param events Event queue.
   * @returns Output length reset to the branch start.
   */
  private static handleGetStackBranch(
    currentNode: SolidAlgorithmCompactNode,
    currEvent: QueuedEvent,
    touched: SolidAlgorithmBrushesTouched,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    output: SolidAlgorithmCategoryStackNode[],
    outputLength: number,
    events: QueuedEvent[],
  ): number {
    void output;
    void outputLength;
    if (currentNode.childCount === 0) {
      return currEvent.outputStartIndex;
    }
    let firstIndex = currentNode.childOffset;
    const lastIndex = firstIndex + currentNode.childCount;
    while (firstIndex < lastIndex) {
      const child = hierarchy[firstIndex];
      if (!child) {
        break;
      }
      if (child.operation === SolidOperation.Additive) {
        break;
      }
      firstIndex++;
    }
    if (lastIndex - firstIndex <= 0) {
      return currEvent.outputStartIndex;
    }
    const leftStackStartIndex = currEvent.outputStartIndex;
    for (let index = lastIndex - 1; index >= firstIndex + 1; index--) {
      const child = hierarchy[index];
      if (!child) {
        continue;
      }
      const childType = touched.get(child.nodeId);
      if (
        childType !== SolidAlgorithmIntersectionType.NoIntersection &&
        childType !== SolidAlgorithmIntersectionType.InvalidValue
      ) {
        events.push(this.makeListItem(index, leftStackStartIndex, childType));
      }
    }
    const firstChild = hierarchy[firstIndex];
    if (firstChild) {
      const firstType = touched.get(firstChild.nodeId);
      if (
        firstType !== SolidAlgorithmIntersectionType.NoIntersection &&
        firstType !== SolidAlgorithmIntersectionType.InvalidValue
      ) {
        events.push(this.makeGetStackNode(firstIndex, leftStackStartIndex, firstType));
      }
    }
    return leftStackStartIndex;
  }

  /**
   * Queues GetStackNode then Combine for a ListItem event.
   *
   * @param currEvent ListItem event.
   * @param outputLength Current stack length.
   * @param events Event queue.
   * @param haveGoneBeyondSelf Current beyond-self flag.
   */
  private static handleListItem(
    currEvent: QueuedEvent,
    outputLength: number,
    events: QueuedEvent[],
    haveGoneBeyondSelf: number,
  ): void {
    const rightStackStartIndex = outputLength;
    events.push(
      this.makeCombine(currEvent.currIndex, haveGoneBeyondSelf, currEvent.leftStackStartIndex, rightStackStartIndex),
    );
    events.push(this.makeGetStackNode(currEvent.currIndex, rightStackStartIndex, currEvent.intersectionType));
  }

  /**
   * Combines left and right stacks for a Combine event.
   *
   * @param currEvent Combine event.
   * @param hierarchy Compact hierarchy.
   * @param output Output stack.
   * @param outputLength Current length.
   * @param haveGoneBeyondSelf Current beyond-self flag.
   * @returns Updated output length.
   */
  private static handleCombine(
    currEvent: QueuedEvent,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    output: SolidAlgorithmCategoryStackNode[],
    outputLength: number,
    haveGoneBeyondSelf: number,
  ): number {
    const node = hierarchy[currEvent.currIndex];
    let operation = node?.operation ?? SolidOperation.Additive;
    if (operation === undefined) {
      operation = SolidOperation.Additive;
    }
    const leftCount = currEvent.rightStackStartIndex - currEvent.leftStackStartIndex;
    const rightCount = outputLength - currEvent.rightStackStartIndex;
    if (leftCount === 0) {
      return this.combineEmptyLeft(operation, currEvent, outputLength);
    }
    if (rightCount === 0) {
      return this.combineEmptyRight(operation, currEvent);
    }
    const rightStack: SolidAlgorithmCategoryStackNode[] = [];
    for (let index = currEvent.rightStackStartIndex; index < outputLength; index++) {
      rightStack.push(output[index]!.clone());
    }
    const leftStackEnd = { value: currEvent.rightStackStartIndex };
    SolidAlgorithmCreateRoutingTableCombine.combine(
      output,
      currEvent.leftHaveGoneBeyondSelf,
      currEvent.leftStackStartIndex,
      leftStackEnd,
      rightStack,
      haveGoneBeyondSelf,
      rightStack.length,
      operation,
    );
    return leftStackEnd.value;
  }

  /**
   * Applies empty-left Combine rules.
   *
   * @param operation Child operation.
   * @param currEvent Combine event.
   * @param outputLength Current length.
   * @returns Updated length.
   */
  private static combineEmptyLeft(operation: SolidOperation, currEvent: QueuedEvent, outputLength: number): number {
    const rightCount = outputLength - currEvent.rightStackStartIndex;
    if (rightCount === 0) {
      return currEvent.leftStackStartIndex;
    }
    if (operation === SolidOperation.Additive) {
      return outputLength;
    }
    return currEvent.rightStackStartIndex;
  }

  /**
   * Applies empty-right Combine rules.
   *
   * @param operation Child operation.
   * @param currEvent Combine event.
   * @returns Updated length.
   */
  private static combineEmptyRight(operation: SolidOperation, currEvent: QueuedEvent): number {
    if (operation === SolidOperation.Intersecting) {
      return currEvent.leftStackStartIndex;
    }
    return currEvent.rightStackStartIndex;
  }

  /**
   * Converts a live CategoryStackNode array into a RoutingTable blob.
   *
   * @param stack Live stack.
   * @param hierarchy Compact hierarchy for prepared-index lookup.
   * @param invertedWorld Inverted-world flag.
   * @returns Routing table.
   */
  private static buildTableFromStack(
    stack: SolidAlgorithmCategoryStackNode[],
    hierarchy: readonly SolidAlgorithmCompactNode[],
    invertedWorld: boolean,
  ): SolidAlgorithmRoutingTable {
    if (stack.length === 0) {
      return SolidAlgorithmRoutingTable.empty(invertedWorld);
    }
    const routingRows = stack.map((node) => node.routingRow);
    const lookups: SolidAlgorithmRoutingLookup[] = [];
    const preparedIndexPerLookup: number[] = [];
    let index = 0;
    while (index < stack.length) {
      const cuttingNodeId = stack[index]!.nodeIdValue;
      const startIndex = index;
      index++;
      while (index < stack.length && stack[index]!.nodeIdValue === cuttingNodeId) {
        index++;
      }
      lookups.push(new SolidAlgorithmRoutingLookup(startIndex, index));
      preparedIndexPerLookup.push(this.preparedIndexForNodeId(hierarchy, cuttingNodeId));
    }
    let minNodeId = 0;
    let maxNodeId = 0;
    for (const lookup of lookups) {
      const nodeId = stack[lookup.startIndex]!.nodeIdValue;
      minNodeId = Math.min(minNodeId, nodeId);
      maxNodeId = Math.max(maxNodeId, nodeId);
    }
    const nodeIdOffset = minNodeId;
    const mapSize = maxNodeId + 1 - minNodeId;
    const nodeIdToTableIndex = new Array<number>(mapSize).fill(-1);
    for (let lookupIndex = 0; lookupIndex < lookups.length; lookupIndex++) {
      const nodeId = stack[lookups[lookupIndex]!.startIndex]!.nodeIdValue;
      nodeIdToTableIndex[nodeId - minNodeId] = lookupIndex;
    }
    return new SolidAlgorithmRoutingTable(
      routingRows,
      lookups,
      preparedIndexPerLookup,
      nodeIdToTableIndex,
      nodeIdOffset,
      invertedWorld,
    );
  }

  /**
   * Resolves prepared index for a compact node id.
   *
   * @param hierarchy Compact hierarchy.
   * @param nodeId Compact node id.
   * @returns Prepared index, or -2 when missing.
   */
  private static preparedIndexForNodeId(hierarchy: readonly SolidAlgorithmCompactNode[], nodeId: number): number {
    for (const node of hierarchy) {
      if (node.nodeId === nodeId) {
        return node.preparedIndex;
      }
    }
    return -2;
  }

  /**
   * Creates a GetStackNode event.
   *
   * @param currIndex Hierarchy index.
   * @param outputStartIndex Output stack start.
   * @param intersectionType Touch type.
   * @returns Queued event.
   */
  private static makeGetStackNode(
    currIndex: number,
    outputStartIndex: number,
    intersectionType: SolidAlgorithmIntersectionType,
  ): QueuedEvent {
    return {
      type: QueuedEventType.GetStackNode,
      currIndex,
      leftHaveGoneBeyondSelf: 0,
      intersectionType,
      outputStartIndex,
      leftStackStartIndex: 0,
      rightStackStartIndex: 0,
    };
  }

  /**
   * Creates a ListItem event.
   *
   * @param currIndex Hierarchy child index.
   * @param leftStackStartIndex Left stack start.
   * @param intersectionType Touch type.
   * @returns Queued event.
   */
  private static makeListItem(
    currIndex: number,
    leftStackStartIndex: number,
    intersectionType: SolidAlgorithmIntersectionType,
  ): QueuedEvent {
    return {
      type: QueuedEventType.ListItem,
      currIndex,
      leftHaveGoneBeyondSelf: 0,
      intersectionType,
      outputStartIndex: 0,
      leftStackStartIndex,
      rightStackStartIndex: 0,
    };
  }

  /**
   * Creates a Combine event.
   *
   * @param currIndex Hierarchy child index.
   * @param leftHaveGoneBeyondSelf Beyond-self snapshot.
   * @param leftStackStartIndex Left stack start.
   * @param rightStackStartIndex Right stack start.
   * @returns Queued event.
   */
  private static makeCombine(
    currIndex: number,
    leftHaveGoneBeyondSelf: number,
    leftStackStartIndex: number,
    rightStackStartIndex: number,
  ): QueuedEvent {
    return {
      type: QueuedEventType.Combine,
      currIndex,
      leftHaveGoneBeyondSelf,
      intersectionType: SolidAlgorithmIntersectionType.InvalidValue,
      outputStartIndex: 0,
      leftStackStartIndex,
      rightStackStartIndex,
    };
  }
}
