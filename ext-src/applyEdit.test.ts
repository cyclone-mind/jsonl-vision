import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyScalarEdit, applyWalkEdit, readScalarEdit } from "./applyEdit";
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

describe("applyWalkEdit", () => {
  it("rewrites a scalar inside a JSON string and leaves sibling strings as strings", () => {
    const line =
      '{"payload":{"arguments":"{\\"cmd\\":\\"ls\\",\\"n\\":1}","note":"{\\"keep\\":true}","name":"shell"}}';
    const result = applyWalkEdit(
      line,
      [
        { key: "payload", parseString: false },
        { key: "arguments", parseString: true },
        { key: "cmd", parseString: false },
      ],
      "pwd"
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.text) as {
      payload: { arguments: string; note: string; name: string };
    };
    assert.equal(parsed.payload.name, "shell");
    assert.equal(parsed.payload.note, '{"keep":true}');
    assert.deepEqual(JSON.parse(parsed.payload.arguments), { cmd: "pwd", n: 1 });
  });

  it("updates a doubly encoded JSON string from the inside out", () => {
    const line = '{"output":"{\\"data\\":\\"{\\\\\\"n\\\\\\":1}\\"}"}';
    const result = applyWalkEdit(
      line,
      [
        { key: "output", parseString: true },
        { key: "data", parseString: true },
        { key: "n", parseString: false },
      ],
      2
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const output = JSON.parse(JSON.parse(result.text).output);
    assert.deepEqual(JSON.parse(output.data), { n: 2 });
    assert.equal(typeof JSON.parse(result.text).output, "string");
  });

  it("refuses to parse a string that is not an object or to replace an object", () => {
    assert.deepEqual(
      applyWalkEdit(
        '{"a":"hello"}',
        [
          { key: "a", parseString: true },
          { key: "b", parseString: false },
        ],
        1
      ),
      { ok: false, reason: "bad-path" }
    );
    assert.deepEqual(applyWalkEdit('{"a":{"b":1}}', [{ key: "a", parseString: true }], 1), {
      ok: false,
      reason: "bad-path",
    });
  });

  it("falls back to a plain path when no step is a JSON string", () => {
    assert.deepEqual(
      applyWalkEdit(
        '{"a":{"b":1}}',
        [
          { key: "a", parseString: false },
          { key: "b", parseString: false },
        ],
        4
      ),
      { ok: true, text: '{"a":{"b":4}}' }
    );
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
