import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { graphPayload, jsonGraphProblem, jsonNestingDepth } from "./jsonGuard";

describe("jsonNestingDepth", () => {
  it("counts objects and arrays and ignores braces inside strings", () => {
    assert.equal(jsonNestingDepth('{"a":"{[}]","b":[1,{"c":2}]}'), 3);
    assert.equal(jsonNestingDepth('"{\\"["'), 0);
    assert.equal(jsonNestingDepth(""), 0);
  });
});

describe("jsonGraphProblem", () => {
  it("allows empty text and ordinary JSON", () => {
    assert.equal(jsonGraphProblem(""), null);
    assert.equal(jsonGraphProblem("   "), null);
    assert.equal(jsonGraphProblem('{"a":1}', { kind: "line" }), null);
    assert.equal(jsonGraphProblem('"a long string of text"', { kind: "line" }), null);
  });

  it("explains invalid JSON without sending it on to the graph", () => {
    const problem = jsonGraphProblem("not json", { kind: "line" });
    assert.match(problem ?? "", /not valid JSON/);
    assert.match(problem ?? "", /^This line/);
    assert.equal(graphPayload("not json", "line").json, "");
  });

  it("names documents and selections differently from lines", () => {
    assert.match(jsonGraphProblem("{", { kind: "document" }) ?? "", /^This document/);
    assert.match(jsonGraphProblem("{", { kind: "selection" }) ?? "", /^This selection/);
  });

  it("rejects nesting past the cap before a recursive graph walk", () => {
    const text = "[".repeat(6) + "1" + "]".repeat(6);
    const problem = jsonGraphProblem(text, { kind: "line", maxDepth: 5 });
    assert.match(problem ?? "", /nested 6 levels/);
  });

  it("rejects an oversized payload before parsing it", () => {
    const text = "x".repeat(20);
    const problem = jsonGraphProblem(text, { kind: "line", maxChars: 10 });
    assert.match(problem ?? "", /20 characters/);
    assert.doesNotMatch(problem ?? "", /not valid JSON/);
  });

  it("returns the original text when there is no problem", () => {
    assert.deepEqual(graphPayload('{"a":1}', "document"), {
      json: '{"a":1}',
      problem: null,
    });
  });
});
