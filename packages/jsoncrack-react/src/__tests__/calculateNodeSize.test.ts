import { describe, expect, it } from "vitest";
import { MAX_NODE_WIDTH, ROW_HEIGHT } from "../layoutConstants";
import { calculateNodeSize } from "../utils/calculateNodeSize";

describe("calculateNodeSize", () => {
  it("wraps a long object-row string and expands its height", () => {
    const value = "这是一段需要完整展示的长字符串。".repeat(24);
    const size = calculateNodeSize([["scene_text", value]]);

    expect(size.width).toBeLessThanOrEqual(MAX_NODE_WIDTH);
    expect(size.rowHeights).toHaveLength(1);
    expect(size.rowHeights![0]).toBeGreaterThan(ROW_HEIGHT);
    expect(size.height).toBe(size.rowHeights![0]);
  });

  it("preserves explicit newlines when calculating wrapped height", () => {
    const value = Array.from({ length: 12 }, (_, index) => `${index + 1}: 台词内容`).join("\n");
    const size = calculateNodeSize([["script", value]]);

    expect(size.rowHeights![0]).toBeGreaterThanOrEqual(12 * 18);
  });

  it("expands a primitive string node instead of clipping it", () => {
    const size = calculateNodeSize("long-value-".repeat(100));

    expect(size.width).toBe(MAX_NODE_WIDTH);
    expect(size.height).toBeGreaterThan(36);
  });
});
