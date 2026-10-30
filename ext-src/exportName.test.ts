import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportFileName } from "./exportName";

describe("exportFileName", () => {
  it("uses the file stem and a 1-based line number", () => {
    assert.equal(exportFileName("events.jsonl", 2, "png"), "events-line-3.png");
    assert.equal(
      exportFileName("/tmp/rollout-session.jsonl", 0, "svg"),
      "rollout-session-line-1.svg"
    );
  });

  it("omits the line for a whole document and sanitizes the name", () => {
    assert.equal(exportFileName("showcase.json", null, "png"), "showcase.png");
    assert.equal(exportFileName("my file (1).jsonl", 9, "svg"), "my-file-1-line-10.svg");
  });
});
