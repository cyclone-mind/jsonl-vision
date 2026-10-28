import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusLineDecision } from "./lineFocus";

const base = {
  line: 5,
  content: '{"id":5}',
  lastFocusedLine: 5 as number | null,
  focusedLine: 5 as number | null,
  openLines: [5],
};

describe("focusLineDecision", () => {
  it("ignores a repeat visit to the line that is already focused", () => {
    assert.equal(focusLineDecision(base), "ignore");
  });

  it("reopens the current line after its tab was closed", () => {
    assert.equal(focusLineDecision({ ...base, openLines: [], focusedLine: null }), "focus");
  });

  it("focuses a line whose tab is open but not the focused one", () => {
    assert.equal(focusLineDecision({ ...base, focusedLine: 3, openLines: [5, 3] }), "focus");
  });

  it("opens a line the cursor has not visited yet", () => {
    assert.equal(
      focusLineDecision({ ...base, line: 2, content: '{"id":2}', openLines: [5] }),
      "focus"
    );
  });

  it("skips blank and whitespace-only lines without treating them as records", () => {
    assert.equal(focusLineDecision({ ...base, line: 6, content: "" }), "skip-blank");
    assert.equal(focusLineDecision({ ...base, line: 6, content: "   \t" }), "skip-blank");
  });

  it("still focuses a line that is a JSON string of spaces", () => {
    assert.equal(focusLineDecision({ ...base, line: 6, content: '"   "' }), "focus");
  });
});
