import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_EXPORT_EDGE, MAX_EXPORT_PIXELS, fitExportSize } from "./exportSize";

describe("fitExportSize", () => {
  it("uses 2× for a small graph", () => {
    assert.deepEqual(fitExportSize(400, 200), {
      width: 800,
      height: 400,
      scale: 2,
      capped: false,
    });
  });

  it("drops to 1× when 2× would pass the edge cap", () => {
    const size = fitExportSize(5000, 1000);
    assert.equal(size?.scale, 1);
    assert.equal(size?.capped, false);
    assert.equal(size?.width, 5000);
  });

  it("scales a huge layout down under the pixel and edge caps", () => {
    const size = fitExportSize(20_000, 10_000);
    assert.ok(size);
    if (!size) return;
    assert.equal(size.capped, true);
    assert.ok(size.width <= MAX_EXPORT_EDGE);
    assert.ok(size.height <= MAX_EXPORT_EDGE);
    assert.ok(size.width * size.height <= MAX_EXPORT_PIXELS);
    assert.ok(Math.abs(size.width / size.height - 2) < 0.02);
  });

  it("rejects an empty layout", () => {
    assert.equal(fitExportSize(0, 100), null);
    assert.equal(fitExportSize(Number.NaN, 10), null);
  });
});
