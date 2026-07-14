import { describe, expect, it } from "vitest";
import { computeLaneIndices } from "../edgeLanes";
import type { EdgeData, NodeRect } from "../types";

const rect = (y: number, h: number, rowOffsetY = 0): NodeRect => ({
  x: 300,
  y,
  width: 40,
  height: h,
  rowOffsetY,
});

const edge = (id: string, from: string, to: string, fromRowIndex: number): EdgeData => ({
  id,
  from,
  to,
  text: null,
  fromRowIndex,
});

describe("computeLaneIndices", () => {
  it("shares one lane for an array's items (same source row)", () => {
    const rects = new Map<string, NodeRect>([
      ["S", { x: 0, y: 300, width: 120, height: 90, rowOffsetY: 0 }],
      ["a", rect(100, 36)],
      ["b", rect(160, 36)],
      ["c", rect(220, 36)],
    ]);
    const edges = [edge("e1", "S", "a", 0), edge("e2", "S", "b", 0), edge("e3", "S", "c", 0)];
    const lanes = computeLaneIndices(edges, rects);
    // one lane group -> all share index 0
    expect(lanes.get("e1")).toBe(0);
    expect(lanes.get("e2")).toBe(0);
    expect(lanes.get("e3")).toBe(0);
  });

  it("orders a lower row's fan inner when its targets sit below (metrics: cpu up, labels down)", () => {
    // source S: 3 container rows at rowY 315 (cpu,0), 345 (mem,1), 375 (labels,2)
    const rects = new Map<string, NodeRect>([
      ["S", { x: 0, y: 300, width: 120, height: 90, rowOffsetY: 0 }],
    ]);
    const edges: EdgeData[] = [];
    // cpu -> 5 nodes ABOVE (centers ~98..338)
    [80, 140, 200, 260, 320].forEach((y, i) => {
      rects.set(`cpu${i}`, rect(y, 36));
      edges.push(edge(`cpu${i}`, "S", `cpu${i}`, 0));
    });
    // mem -> 3 nodes around the middle
    [330, 370, 410].forEach((y, i) => {
      rects.set(`mem${i}`, rect(y, 36));
      edges.push(edge(`mem${i}`, "S", `mem${i}`, 1));
    });
    // labels -> 3 nodes BELOW
    [500, 540, 580].forEach((y, i) => {
      rects.set(`lab${i}`, rect(y, 36));
      edges.push(edge(`lab${i}`, "S", `lab${i}`, 2));
    });
    const lanes = computeLaneIndices(edges, rects);
    // labels (lower row, lower targets) must be inner of mem to avoid crossings
    expect(lanes.get("lab0")! < lanes.get("mem0")!).toBe(true);
  });

  it("orders the upper row's fan inner when both fans go up (line 7: flags/nested)", () => {
    // source S: rows at fromRowIndex 4 (flags, rowY 780) and 5 (nested, rowY 810)
    const rects = new Map<string, NodeRect>([
      ["S", { x: 0, y: 645, width: 120, height: 240, rowOffsetY: 0 }],
      ["flags", rect(633, 36)], // center 651, above flags row 780
      ["nested", rect(755, 36)], // center 773, above nested row 810
    ]);
    const edges = [edge("flags", "S", "flags", 4), edge("nested", "S", "nested", 5)];
    const lanes = computeLaneIndices(edges, rects);
    // flags (upper row) must be inner of nested here
    expect(lanes.get("flags")! < lanes.get("nested")!).toBe(true);
  });

  it.each([8, 13])("assigns a distinct deterministic index to %i routed rows", count => {
    const rects = new Map<string, NodeRect>([
      ["S", { x: 0, y: 300, width: 120, height: count * 30, rowOffsetY: 0 }],
    ]);
    const edges = Array.from({ length: count }, (_, index) => {
      const target = `target-${index}`;
      rects.set(target, rect(40 + ((index * 97) % 620), 36));
      return edge(`edge-${index}`, "S", target, index);
    });

    const lanes = computeLaneIndices(edges, rects);
    const indices = edges.map(item => lanes.get(item.id));
    expect(new Set(indices).size).toBe(count);
    expect(indices.every(index => index != null && index >= 0 && index < count)).toBe(true);
  });

  it("uses straight target landing geometry when choosing the lane order", () => {
    const rects = new Map<string, NodeRect>([
      ["S", { x: 0, y: 85, width: 120, height: 60, rowOffsetY: 0 }],
      ["a-high", rect(0, 80)],
      ["a-low", rect(120, 80)],
      ["b-one", rect(120, 80)],
      ["b-two", rect(120, 80)],
    ]);
    const edges = [
      edge("a-high", "S", "a-high", 0),
      edge("a-low", "S", "a-low", 0),
      edge("b-one", "S", "b-one", 1),
      edge("b-two", "S", "b-two", 1),
    ];

    const lanes = computeLaneIndices(edges, rects);
    expect(lanes.get("a-high")! < lanes.get("b-one")!).toBe(true);
  });
});
