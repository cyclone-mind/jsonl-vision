// Pure path-addressed scalar write-back for a single JSONL line.
//
// The webview sends the JSONPath of an edited scalar plus the already-typed new
// value (ADR 0001 items 5-7). This applies it to one line's JSON text and hands
// back the new text to write over that line. No `vscode` import so it can be
// unit-run under node.
//
// Formatting note: this re-serializes the line with `JSON.stringify`, i.e.
// compact output. JSONL lines are one compact JSON value per line, so that
// matches the format; it does not try to preserve incidental interior spacing.

export type PathSegment = string | number;
export type Scalar = string | number | boolean | null;

export type ApplyEditResult =
  | { ok: true; text: string }
  | { ok: false; reason: "invalid-json" | "bad-path" | "bad-value" };

export interface ScalarEdit {
  path: PathSegment[];
  value: Scalar;
}

const NOT_OWN = Symbol("not-own");

function isPathSegment(value: unknown): value is PathSegment {
  if (typeof value === "string") return true;
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

/** JSON scalars only. `NaN` and infinities are rejected: `JSON.stringify` would write them as `null`. */
export function isJsonScalar(value: unknown): value is Scalar {
  if (value === null) return true;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    default:
      return false;
  }
}

function isLeaf(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

/**
 * Read an own property. Bracket access is not used: `"toString" in obj` is
 * true for inherited names, and assigning `"length"` on an array truncates it.
 * Arrays only accept an index that already exists.
 */
function readOwn(cursor: object, segment: PathSegment): unknown {
  if (Array.isArray(cursor)) {
    if (typeof segment !== "number" || !Object.hasOwn(cursor, segment)) return NOT_OWN;
    return Object.getOwnPropertyDescriptor(cursor, segment)?.value;
  }
  const key = typeof segment === "number" ? String(segment) : segment;
  if (!Object.hasOwn(cursor, key)) return NOT_OWN;
  // `getOwnPropertyDescriptor` returns a real `__proto__` key. Bracket access
  // would follow the inherited getter instead.
  return Object.getOwnPropertyDescriptor(cursor, key)?.value;
}

function writeOwn(cursor: object, segment: PathSegment, value: Scalar) {
  if (Array.isArray(cursor)) {
    cursor[segment as number] = value;
    return;
  }
  const key = typeof segment === "number" ? String(segment) : segment;
  Object.defineProperty(cursor, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function applyScalarEdit(
  lineText: string,
  path: PathSegment[],
  value: Scalar
): ApplyEditResult {
  if (!isJsonScalar(value)) return { ok: false, reason: "bad-value" };
  if (!path.every(isPathSegment)) return { ok: false, reason: "bad-path" };

  let root: unknown;
  try {
    root = JSON.parse(lineText);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  // Editing the root scalar itself (a line that is just `42` or `"x"`).
  // An empty path must not replace an object or array.
  if (path.length === 0) {
    if (!isLeaf(root)) return { ok: false, reason: "bad-path" };
    return { ok: true, text: JSON.stringify(value) };
  }

  let cursor: unknown = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (cursor === null || typeof cursor !== "object") return { ok: false, reason: "bad-path" };
    const child = readOwn(cursor, path[i]);
    if (child === NOT_OWN) return { ok: false, reason: "bad-path" };
    cursor = child;
  }

  const last = path[path.length - 1];
  if (cursor === null || typeof cursor !== "object") return { ok: false, reason: "bad-path" };
  const current = readOwn(cursor, last);
  if (current === NOT_OWN || !isLeaf(current)) return { ok: false, reason: "bad-path" };

  writeOwn(cursor, last, value);
  return { ok: true, text: JSON.stringify(root) };
}

/**
 * One step of a write that may pass through a string field whose text is JSON.
 * `parseString` means the value at `key` is a JSON string: parse it and keep
 * walking inside the parsed value, then stringify that value back into the
 * same field. The last step is the scalar being replaced and is not parsed.
 */
export interface WalkStep {
  key: PathSegment;
  parseString: boolean;
}

/**
 * Like `applyScalarEdit`, but a step may address a JSON value that is stored
 * as a string. Only those string fields are re-serialized; a sibling string
 * stays a string. An empty walk replaces a root scalar and refuses a root
 * object, matching `applyScalarEdit`.
 */
export function applyWalkEdit(
  lineText: string,
  walk: readonly WalkStep[],
  value: Scalar
): ApplyEditResult {
  if (!isJsonScalar(value)) return { ok: false, reason: "bad-value" };
  if (
    walk.some(
      step =>
        !step ||
        typeof step.parseString !== "boolean" ||
        !isPathSegment(step.key) ||
        (step.parseString && step === walk[walk.length - 1])
    )
  ) {
    return { ok: false, reason: "bad-path" };
  }
  if (walk.every(step => !step.parseString)) {
    return applyScalarEdit(
      lineText,
      walk.map(step => step.key),
      value
    );
  }

  let root: unknown;
  try {
    root = JSON.parse(lineText);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  interface StringFrame {
    parent: object;
    key: PathSegment;
    parsed: object;
  }

  const frames: StringFrame[] = [];
  let cursor: unknown = root;
  for (let i = 0; i < walk.length - 1; i += 1) {
    const step = walk[i];
    if (cursor === null || typeof cursor !== "object") return { ok: false, reason: "bad-path" };
    const child = readOwn(cursor, step.key);
    if (child === NOT_OWN) return { ok: false, reason: "bad-path" };
    if (step.parseString) {
      if (typeof child !== "string") return { ok: false, reason: "bad-path" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(child);
      } catch {
        return { ok: false, reason: "bad-path" };
      }
      if (parsed === null || typeof parsed !== "object") return { ok: false, reason: "bad-path" };
      frames.push({ parent: cursor, key: step.key, parsed });
      cursor = parsed;
    } else {
      cursor = child;
    }
  }

  const last = walk[walk.length - 1];
  if (cursor === null || typeof cursor !== "object") return { ok: false, reason: "bad-path" };
  const current = readOwn(cursor, last.key);
  if (current === NOT_OWN || !isLeaf(current)) return { ok: false, reason: "bad-path" };
  writeOwn(cursor, last.key, value);

  // Inner strings first, so each outer stringify sees the updated text.
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    writeOwn(frame.parent, frame.key, JSON.stringify(frame.parsed));
  }
  return { ok: true, text: JSON.stringify(root) };
}

/** Validate a webview `editValue` message. A missing value is not stored as null. */
export function readScalarEdit(message: unknown): ScalarEdit | null {
  if (!message || typeof message !== "object") return null;
  const record = message as { type?: unknown; path?: unknown; value?: unknown };
  if (record.type !== "editValue" || !Array.isArray(record.path)) return null;
  if (!record.path.every(isPathSegment)) return null;
  if (!isJsonScalar(record.value)) return null;
  return { path: [...record.path], value: record.value };
}

export function describeEditFailure(reason: "invalid-json" | "bad-path" | "bad-value"): string {
  switch (reason) {
    case "invalid-json":
      return "JSONL Vision couldn't update this line because it is not valid JSON.";
    case "bad-value":
      return "JSONL Vision couldn't update this line because that value is not a finite JSON scalar.";
    case "bad-path":
      return "JSONL Vision couldn't update this line because that field is not a scalar on it.";
  }
}
