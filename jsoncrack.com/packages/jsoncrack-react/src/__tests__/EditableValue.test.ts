import { describe, expect, it } from "vitest";
import { coerceEditableScalar } from "../components/EditableValue";

describe("coerceEditableScalar", () => {
  it("keeps strings and exact booleans", () => {
    expect(coerceEditableScalar("hello", "string")).toEqual({ ok: true, value: "hello" });
    expect(coerceEditableScalar("true", "boolean")).toEqual({ ok: true, value: true });
    expect(coerceEditableScalar("TRUE", "boolean")).toEqual({ ok: false });
  });

  it("accepts finite numbers and rejects blanks, NaN, and infinities", () => {
    expect(coerceEditableScalar("-12.5", "number")).toEqual({ ok: true, value: -12.5 });
    expect(coerceEditableScalar("0", "number")).toEqual({ ok: true, value: 0 });
    expect(coerceEditableScalar("", "number")).toEqual({ ok: false });
    expect(coerceEditableScalar("NaN", "number")).toEqual({ ok: false });
    expect(coerceEditableScalar("Infinity", "number")).toEqual({ ok: false });
    expect(coerceEditableScalar("1e309", "number")).toEqual({ ok: false });
  });

  it("does not coerce a non-finite null edit into a number", () => {
    // A null may become another scalar, but Infinity must not: stringify would
    // persist it as null and wipe the field.
    expect(coerceEditableScalar("Infinity", "null")).toEqual({ ok: true, value: "Infinity" });
    expect(coerceEditableScalar("1e2", "null")).toEqual({ ok: true, value: 100 });
    expect(coerceEditableScalar("", "null")).toEqual({ ok: true, value: null });
  });
});
