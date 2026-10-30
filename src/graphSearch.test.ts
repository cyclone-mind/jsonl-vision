import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GraphSearchNode } from "./graphSearch";
import { findGraphMatches, matchCountLabel, stepMatchIndex } from "./graphSearch";

const nodes: GraphSearchNode[] = [
  {
    id: "1",
    text: [
      { key: "name", value: "Read", type: "string" },
      { key: "file_path", value: "/src/Parser.ts", type: "string" },
      { key: "ok", value: false, type: "boolean" },
      { key: "input", value: "{2 keys}", type: "object" },
    ],
  },
  {
    id: "2",
    label: "file_path",
    text: [{ key: null, value: "parser.ts", type: "string" }],
  },
];

describe("findGraphMatches", () => {
  it("matches keys and values case-insensitively and skips container summaries", () => {
    const matches = findGraphMatches(nodes, "file");
    assert.deepEqual(
      matches.map(match => `${match.nodeId}:${match.field}:${match.rowIndex}`),
      ["1:key:1", "2:label:-1"]
    );
  });

  it("matches boolean and null text", () => {
    assert.equal(findGraphMatches(nodes, "FALSE").length, 1);
    assert.equal(
      findGraphMatches([{ id: "1", text: [{ key: "a", value: null }] }], "null").length,
      1
    );
  });

  it("returns nothing for a blank query", () => {
    assert.deepEqual(findGraphMatches(nodes, "   "), []);
  });
});

describe("stepMatchIndex", () => {
  it("starts at the ends and wraps", () => {
    assert.equal(stepMatchIndex(3, -1, false), 0);
    assert.equal(stepMatchIndex(3, -1, true), 2);
    assert.equal(stepMatchIndex(3, 2, false), 0);
    assert.equal(stepMatchIndex(3, 0, true), 2);
    assert.equal(stepMatchIndex(0, -1, false), -1);
  });

  it("labels the count", () => {
    assert.equal(matchCountLabel(0, -1), "No matches");
    assert.equal(matchCountLabel(1, -1), "1 match");
    assert.equal(matchCountLabel(4, -1), "4 matches");
    assert.equal(matchCountLabel(4, 1), "2 of 4");
  });
});
