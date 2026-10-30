import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findLineContaining, parseGoToLine } from "./lineSearch";

const lines = [
  '{"id":1,"action":"login"}',
  "not json but has Parser",
  "",
  '{"file":"src/parser.ts","n":2}',
  '{"note":"PARSER again"}',
];

describe("findLineContaining", () => {
  it("finds the next and previous line by raw text without requiring JSON", () => {
    const textAt = (line: number) => lines[line] ?? "";
    assert.equal(findLineContaining(0, 1, lines.length, "parser", textAt), 1);
    assert.equal(findLineContaining(1, 1, lines.length, "parser", textAt), 3);
    assert.equal(findLineContaining(3, -1, lines.length, "Parser", textAt), 1);
  });

  it("wraps once and skips the line it started on", () => {
    const textAt = (line: number) => lines[line] ?? "";
    assert.equal(findLineContaining(4, 1, lines.length, "parser", textAt), 1);
    assert.equal(findLineContaining(1, 1, lines.length, "login", textAt), 0);
    assert.equal(findLineContaining(0, 1, lines.length, "login", textAt), null);
  });

  it("ignores a blank query and does not parse line text", () => {
    let reads = 0;
    const textAt = (line: number) => {
      reads += 1;
      return lines[line] ?? "";
    };
    assert.equal(findLineContaining(0, 1, lines.length, "   ", textAt), null);
    assert.equal(reads, 0);
    assert.equal(findLineContaining(0, 1, lines.length, "parser", textAt), 1);
    assert.equal(reads, 1);
  });
});

describe("parseGoToLine", () => {
  it("accepts a 1-based line and rejects blanks, junk, and out of range", () => {
    assert.deepEqual(parseGoToLine(" 3 ", 10), { ok: true, line: 2 });
    assert.deepEqual(parseGoToLine("1", 1), { ok: true, line: 0 });
    assert.equal(parseGoToLine("", 10).ok, false);
    assert.equal(parseGoToLine("0", 10).ok, false);
    assert.equal(parseGoToLine("1.5", 10).ok, false);
    assert.equal(parseGoToLine("nope", 10).ok, false);
    assert.equal(parseGoToLine("11", 10).ok, false);
  });
});
