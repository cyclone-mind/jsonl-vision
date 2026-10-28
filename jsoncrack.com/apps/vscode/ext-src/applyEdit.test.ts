import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyScalarEdit, readScalarEdit } from "./applyEdit";
import { normalizeDocumentLine } from "./lineText";

describe("applyScalarEdit", () => {
  it("updates a nested scalar and preserves sibling keys", () => {
    const result = applyScalarEdit('{"a":{"b":1},"c":"x"}', ["a", "b"], 2);
    assert.deepEqual(result, { ok: true, text: '{"a":{"b":2},"c":"x"}' });
  });

  it("updates an array element and a scalar inside an array object", () => {
    assert.deepEqual(applyScalarEdit("[10,20]", [0], 5), { ok: true, text: "[5,20]" });
    assert.deepEqual(applyScalarEdit('{"a":[1,{"b":true}]}', ["a", 1, "b"], false), {
      ok: true,
      text: '{"a":[1,{"b":false}]}',
    });
  });

  it("replaces a root scalar and refuses to replace a root object", () => {
    assert.deepEqual(applyScalarEdit("42", [], 7), { ok: true, text: "7" });
    assert.deepEqual(applyScalarEdit('{"a":1}', [], 2), { ok: false, reason: "bad-path" });
  });

  it("writes 0, false, null, and unicode without dropping them", () => {
    assert.deepEqual(applyScalarEdit('{"a":1}', ["a"], 0), { ok: true, text: '{"a":0}' });
    assert.deepEqual(applyScalarEdit('{"ok":true}', ["ok"], false), {
      ok: true,
      text: '{"ok":false}',
    });
    assert.deepEqual(applyScalarEdit('{"a":1}', ["a"], null), { ok: true, text: '{"a":null}' });
    assert.deepEqual(applyScalarEdit('{"s":"héllo"}', ["s"], "你好"), {
      ok: true,
      text: '{"s":"你好"}',
    });
  });

  it("refuses inherited names, missing keys, and array length", () => {
    assert.deepEqual(applyScalarEdit('{"a":1}', ["toString"], "x"), {
      ok: false,
      reason: "bad-path",
    });
    assert.deepEqual(applyScalarEdit('{"a":1}', ["constructor"], "x"), {
      ok: false,
      reason: "bad-path",
    });
    assert.deepEqual(applyScalarEdit('{"a":1}', ["missing"], 1), { ok: false, reason: "bad-path" });
    assert.deepEqual(applyScalarEdit("[1,2,3]", ["length"], 1), { ok: false, reason: "bad-path" });
    assert.deepEqual(applyScalarEdit("[1,2,3]", [5], 1), { ok: false, reason: "bad-path" });
  });

  it("updates an own __proto__ key without changing the prototype", () => {
    const result = applyScalarEdit('{"__proto__":1,"a":2}', ["__proto__"], 3);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.text, '{"__proto__":3,"a":2}');
    const parsed: unknown = JSON.parse(result.text);
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  });

  it("does not create a __proto__ key that was not already on the object", () => {
    const result = applyScalarEdit('{"a":1}', ["__proto__"], null);
    assert.deepEqual(result, { ok: false, reason: "bad-path" });
    const parsed: unknown = JSON.parse('{"a":1}');
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  });

  it("refuses to replace an object or array with a scalar", () => {
    assert.deepEqual(applyScalarEdit('{"a":{"b":1}}', ["a"], 1), { ok: false, reason: "bad-path" });
    assert.deepEqual(applyScalarEdit('{"a":[1]}', ["a"], 1), { ok: false, reason: "bad-path" });
  });

  it("refuses non-finite numbers instead of letting stringify turn them into null", () => {
    assert.deepEqual(applyScalarEdit('{"n":1}', ["n"], Number.POSITIVE_INFINITY), {
      ok: false,
      reason: "bad-value",
    });
    assert.deepEqual(applyScalarEdit('{"n":1}', ["n"], Number.NaN), {
      ok: false,
      reason: "bad-value",
    });
  });

  it("refuses invalid JSON and a path that descends through a scalar", () => {
    assert.deepEqual(applyScalarEdit("{", ["a"], 1), { ok: false, reason: "invalid-json" });
    assert.deepEqual(applyScalarEdit('{"a":1}', ["a", "b"], 1), { ok: false, reason: "bad-path" });
  });
});

describe("readScalarEdit", () => {
  it("accepts a finite scalar, including null, 0, and false", () => {
    assert.deepEqual(readScalarEdit({ type: "editValue", path: ["a", 0], value: null }), {
      path: ["a", 0],
      value: null,
    });
    assert.equal(readScalarEdit({ type: "editValue", path: ["a"], value: 0 })?.value, 0);
    assert.equal(readScalarEdit({ type: "editValue", path: ["a"], value: false })?.value, false);
  });

  it("rejects a missing value, infinities, and a non-index path segment", () => {
    assert.equal(readScalarEdit({ type: "editValue", path: ["a"] }), null);
    assert.equal(
      readScalarEdit({ type: "editValue", path: ["a"], value: Number.POSITIVE_INFINITY }),
      null
    );
    assert.equal(readScalarEdit({ type: "editValue", path: ["a", -1], value: 1 }), null);
    assert.equal(readScalarEdit({ type: "editValue", path: [{}], value: 1 }), null);
    assert.equal(readScalarEdit({ type: "clickTab", path: ["a"], value: 1 }), null);
  });
});

describe("normalizeDocumentLine", () => {
  it("strips a BOM from line 0 only", () => {
    assert.equal(normalizeDocumentLine(0, '\uFEFF{"a":1}'), '{"a":1}');
    assert.equal(normalizeDocumentLine(1, '\uFEFF{"a":1}'), '\uFEFF{"a":1}');
    assert.equal(normalizeDocumentLine(0, '{"a":1}'), '{"a":1}');
  });
});
