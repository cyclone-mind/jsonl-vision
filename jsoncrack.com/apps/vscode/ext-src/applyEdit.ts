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
  | { ok: false; reason: "invalid-json" | "bad-path" };

export function applyScalarEdit(
  lineText: string,
  path: PathSegment[],
  value: Scalar
): ApplyEditResult {
  let root: unknown;
  try {
    root = JSON.parse(lineText);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  // Editing the root scalar itself (a line that is just `42` or `"x"`).
  if (path.length === 0) {
    return { ok: true, text: JSON.stringify(value) };
  }

  let cursor: unknown = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (cursor == null || typeof cursor !== "object") return { ok: false, reason: "bad-path" };
    cursor = (cursor as Record<PathSegment, unknown>)[path[i]];
  }

  const last = path[path.length - 1];
  if (cursor == null || typeof cursor !== "object") return { ok: false, reason: "bad-path" };
  // Only overwrite existing leaves; never create new keys/indices via an edit.
  if (!(last in (cursor as Record<PathSegment, unknown>))) {
    return { ok: false, reason: "bad-path" };
  }

  (cursor as Record<PathSegment, unknown>)[last] = value;
  return { ok: true, text: JSON.stringify(root) };
}
