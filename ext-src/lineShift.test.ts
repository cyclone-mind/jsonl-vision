import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextChange } from "./lineShift";
import { countLineBreaks, shiftLineNumber } from "./lineShift";
import { applyLineShifts, createState, reduce } from "./lineTabs";

const change = (
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
  text: string
): TextChange => ({ startLine, startChar, endLine, endChar, text });

describe("countLineBreaks", () => {
  it("counts LF, CRLF, and CR as one break each", () => {
    assert.equal(countLineBreaks("a\nb\r\nc\rd"), 3);
    assert.equal(countLineBreaks("none"), 0);
  });
});

describe("shiftLineNumber", () => {
  it("pushes later lines down when a newline is inserted above them", () => {
    const inserted = change(0, 0, 0, 0, "\n");
    assert.equal(shiftLineNumber(0, [inserted]), 1);
    assert.equal(shiftLineNumber(5, [inserted]), 6);
  });

  it("keeps the line when a newline is inserted in the middle of it", () => {
    const split = change(2, 5, 2, 5, "\n");
    assert.equal(shiftLineNumber(2, [split]), 2);
    assert.equal(shiftLineNumber(3, [split]), 4);
  });

  it("follows a record when several newlines are inserted at column 0", () => {
    const inserted = change(4, 0, 4, 0, "\n\n");
    assert.equal(shiftLineNumber(4, [inserted]), 6);
    assert.equal(shiftLineNumber(3, [inserted]), 3);
  });

  it("keeps the line slot when its contents are replaced without a line break", () => {
    const replaced = change(2, 0, 2, 8, '{"id":9}');
    assert.equal(shiftLineNumber(2, [replaced]), 2);
    assert.equal(shiftLineNumber(3, [replaced]), 3);
  });

  it("closes a line that was deleted and pulls later lines up", () => {
    const deleted = change(0, 0, 1, 0, "");
    assert.equal(shiftLineNumber(0, [deleted]), null);
    assert.equal(shiftLineNumber(1, [deleted]), 0);
    assert.equal(shiftLineNumber(5, [deleted]), 4);
  });

  it("closes every line fully inside a multi-line deletion", () => {
    const deleted = change(2, 0, 4, 0, "");
    assert.equal(shiftLineNumber(1, [deleted]), 1);
    assert.equal(shiftLineNumber(2, [deleted]), null);
    assert.equal(shiftLineNumber(3, [deleted]), null);
    assert.equal(shiftLineNumber(4, [deleted]), 2);
  });

  it("keeps a line whose newline is removed when it is joined with the next", () => {
    // Delete the break at the end of line 2. Line 2 survives; line 3 is absorbed.
    const join = change(2, 4, 3, 0, "");
    assert.equal(shiftLineNumber(2, [join]), 2);
    assert.equal(shiftLineNumber(3, [join]), 2);
    assert.equal(shiftLineNumber(4, [join]), 3);
  });

  it("keeps the slot when a whole line is replaced by another line", () => {
    const replaced = change(2, 0, 3, 0, '{"id":9}\n');
    assert.equal(shiftLineNumber(2, [replaced]), 2);
    assert.equal(shiftLineNumber(3, [replaced]), 3);
  });

  it("applies non-overlapping edits from the original document", () => {
    // Delete lines 0-1 and insert a blank line at the original line 5.
    const edits = [change(0, 0, 2, 0, ""), change(5, 0, 5, 0, "\n")];
    assert.equal(shiftLineNumber(5, edits), 4);
    assert.equal(shiftLineNumber(0, edits), null);
    assert.equal(shiftLineNumber(2, edits), 0);
  });

  it("ignores an edit that is entirely below the anchor", () => {
    assert.equal(shiftLineNumber(1, [change(4, 0, 4, 1, "x")]), 1);
  });
});

describe("applyLineShifts", () => {
  it("moves open tabs with their records and keeps snapshots", () => {
    let state = reduce(createState(), { type: "FOCUS_LINE", line: 4, content: '{"id":4}' });
    state = reduce(state, { type: "FOCUS_LINE", line: 1, content: '{"id":1}' });

    const next = applyLineShifts(state, [change(0, 0, 0, 0, "\n")]);

    assert.deepEqual(
      next.tabs.map(tab => ({ line: tab.line, snapshot: tab.snapshot })),
      [
        { line: 5, snapshot: '{"id":4}' },
        { line: 2, snapshot: '{"id":1}' },
      ]
    );
    assert.equal(next.focusedLine, 2);
  });

  it("closes a tab whose line was deleted and keeps a later tab", () => {
    let state = reduce(createState(), { type: "FOCUS_LINE", line: 4, content: '{"id":4}' });
    state = reduce(state, { type: "FOCUS_LINE", line: 1, content: '{"id":1}' });

    const next = applyLineShifts(state, [change(1, 0, 2, 0, "")]);

    assert.deepEqual(
      next.tabs.map(tab => tab.line),
      [3]
    );
    assert.equal(next.tabs[0].snapshot, '{"id":4}');
    assert.equal(next.focusedLine, null);
  });

  it("keeps one tab when two lines are joined", () => {
    let state = reduce(createState(), { type: "FOCUS_LINE", line: 2, content: '{"id":2}' });
    state = reduce(state, { type: "FOCUS_LINE", line: 3, content: '{"id":3}' });

    const next = applyLineShifts(state, [change(2, 8, 3, 0, "")]);

    assert.deepEqual(
      next.tabs.map(tab => ({ line: tab.line, snapshot: tab.snapshot })),
      [{ line: 2, snapshot: '{"id":2}' }]
    );
    // The focused line was absorbed into the surviving record.
    assert.equal(next.focusedLine, 2);
  });

  it("returns the same state when an in-line edit does not move any tab", () => {
    const state = reduce(createState(), { type: "FOCUS_LINE", line: 2, content: "{}" });
    const next = applyLineShifts(state, [change(2, 1, 2, 3, "abc")]);
    assert.equal(next, state);
  });

  it("returns the same state when there are no changes or no tabs", () => {
    const state = reduce(createState(), { type: "FOCUS_LINE", line: 0, content: "{}" });
    assert.equal(applyLineShifts(state, []), state);
    const empty = createState();
    assert.equal(applyLineShifts(empty, [change(0, 0, 0, 0, "\n")]), empty);
  });
});
