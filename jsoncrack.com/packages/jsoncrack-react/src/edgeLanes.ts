import { getSourceRowY, getTargetLandingY } from "./edgeGeometry";
import type { EdgeData, NodeRect } from "./types";

/** Above this many lanes, fall back to a bounded greedy approximation. */
const EXACT_ORDER_MAX = 12;

/** A fork lane: all connectors leaving one source row (array items share it). */
interface Lane {
  rowY: number;
  targetYs: number[];
  /** Riser vertical extent: [min, max] of rowY and every target Y. */
  lo: number;
  hi: number;
  edgeIds: string[];
}

/**
 * Number of connector crossings if lane `a` is routed inner (left) of lane `b`.
 * Two things cross an outer lane's riser: the inner lane's rightward branches
 * (at its target Ys) and the outer lane's own source stub (at its row Y).
 */
function crossCount(a: Lane, b: Lane): number {
  let c = 0;
  for (const ty of a.targetYs) if (ty > b.lo && ty < b.hi) c += 1;
  if (b.rowY > a.lo && b.rowY < a.hi) c += 1;
  return c;
}

/** Order lane indices inner→outer to minimize connector crossings. */
export function orderLanes(lanes: Lane[]): number[] {
  const idx = lanes.map((_, i) => i);
  if (lanes.length <= 1) return idx;

  if (lanes.length <= EXACT_ORDER_MAX) {
    // Exact minimum linear ordering via subset DP. Appending `last` adds the
    // crossing cost from every already-inner lane to `last`. This replaces the
    // previous n! permutation materialization with O(2^n * n^2) bounded work.
    const stateCount = 1 << lanes.length;
    const costs = Array.from({ length: stateCount }, () => new Array(lanes.length).fill(Infinity));
    const previous = Array.from({ length: stateCount }, () => new Array(lanes.length).fill(-1));

    for (const lane of idx) costs[1 << lane][lane] = 0;

    for (let mask = 1; mask < stateCount; mask += 1) {
      for (const last of idx) {
        if ((mask & (1 << last)) === 0) continue;
        const beforeMask = mask ^ (1 << last);
        if (beforeMask === 0) continue;

        let appendCost = 0;
        for (const inner of idx) {
          if ((beforeMask & (1 << inner)) !== 0)
            appendCost += crossCount(lanes[inner], lanes[last]);
        }

        for (const priorLast of idx) {
          if ((beforeMask & (1 << priorLast)) === 0) continue;
          const candidate = costs[beforeMask][priorLast] + appendCost;
          if (candidate < costs[mask][last]) {
            costs[mask][last] = candidate;
            previous[mask][last] = priorLast;
          }
        }
      }
    }

    const fullMask = stateCount - 1;
    let last = idx.reduce((best, lane) =>
      costs[fullMask][lane] < costs[fullMask][best] ? lane : best
    );
    const order = new Array<number>(lanes.length);
    let mask = fullMask;
    for (let position = lanes.length - 1; position >= 0; position -= 1) {
      order[position] = last;
      const priorLast = previous[mask][last];
      mask ^= 1 << last;
      last = priorLast;
    }
    return order;
  }

  // Too many lanes to brute force: greedy pairwise order.
  return idx.sort((a, b) => crossCount(lanes[a], lanes[b]) - crossCount(lanes[b], lanes[a]));
}

/**
 * Assign every edge a fork-lane index (0 = innermost) per source node, ordered
 * to minimize connector crossings. Edges leaving the same source row (an array's
 * items) share one lane. Returns a map from edge id to lane index; edges whose
 * source/target rects aren't known yet are omitted (callers fall back to 0).
 */
export function computeLaneIndices(
  edges: EdgeData[],
  nodeRects: Map<string, NodeRect>
): Map<string, number> {
  const bySource = new Map<string, Map<number, Lane>>();

  for (const edge of edges) {
    if (edge.fromRowIndex == null) continue;
    const src = nodeRects.get(edge.from);
    const tgt = nodeRects.get(edge.to);
    if (!src || !tgt) continue;

    const rowY = getSourceRowY(edge, src);
    if (rowY == null) continue;
    const targetY = getTargetLandingY(rowY, tgt);

    let rows = bySource.get(edge.from);
    if (!rows) {
      rows = new Map();
      bySource.set(edge.from, rows);
    }
    let lane = rows.get(edge.fromRowIndex);
    if (!lane) {
      lane = { rowY, targetYs: [], lo: rowY, hi: rowY, edgeIds: [] };
      rows.set(edge.fromRowIndex, lane);
    }
    lane.targetYs.push(targetY);
    lane.edgeIds.push(edge.id);
    lane.lo = Math.min(lane.lo, targetY);
    lane.hi = Math.max(lane.hi, targetY);
  }

  const result = new Map<string, number>();
  for (const rows of bySource.values()) {
    const lanes = [...rows.values()];
    const order = orderLanes(lanes);
    order.forEach((laneArrayIndex, laneIndex) => {
      for (const id of lanes[laneArrayIndex].edgeIds) result.set(id, laneIndex);
    });
  }
  return result;
}
