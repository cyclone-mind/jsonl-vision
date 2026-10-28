// Adjust a 0-based line anchor after a document edit.
//
// Tabs are anchored by line number (ADR 0001 item 8). An insert or delete above
// an open line moves that record, and the focused tab otherwise live-syncs onto
// whatever text now sits at the old number — the next scalar edit is then
// written to the wrong record. These helpers apply the edit's line delta so the
// anchor stays on the same record. This is not content-fingerprint tracking;
// the document edit itself says how line numbers moved.
//
// Coordinates match `vscode.TextDocumentContentChangeEvent`: positions are in
// the document from before this event, and a batch does not overlap. Callers
// may pass the batch in any order.

export interface TextChange {
  /** 0-based line where the replaced range starts. */
  startLine: number;
  /** Character offset within `startLine` (UTF-16, same as VS Code). */
  startChar: number;
  endLine: number;
  endChar: number;
  /** Replacement text. Line breaks may be `\n`, `\r\n`, or `\r`. */
  text: string;
}

/** Number of line breaks in `text`. A `\r\n` pair counts as one. */
export function countLineBreaks(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") count += 1;
    else if (ch === "\r") {
      count += 1;
      if (text[i + 1] === "\n") i += 1;
    }
  }
  return count;
}

/**
 * Where a line anchor moves after one change.
 * Returns null when that line was deleted (its tab should close).
 */
export function shiftLineAfterChange(line: number, change: TextChange): number | null {
  const { startLine, startChar, endLine, endChar, text } = change;
  const inserted = countLineBreaks(text);
  const removed = endLine - startLine;
  const delta = inserted - removed;

  // Edit is entirely below this line.
  if (startLine > line) return line;

  // Edit ends at or before the first character of this line, so the line's
  // content survives and just shifts by the net lines added or removed above it.
  if (endLine < line || (endLine === line && endChar === 0 && startLine < line)) {
    return line + delta;
  }

  // Edit stays inside this line (it does not consume the line break after it).
  if (startLine === line && endLine === line) {
    // A pure insertion at column 0 pushes the original record down.
    if (startChar === 0 && endChar === 0) return line + inserted;
    // A prefix replace or a mid-line edit keeps this line slot.
    return line;
  }

  // Edit starts on this line and continues onto later lines, so it consumes
  // this line's break.
  if (startLine === line && endLine > line) {
    // The beginning of the line survives (joined with the following text).
    if (startChar > 0) return line;
    // The whole line was covered. A replacement that still contains a line
    // break leaves a record in this slot; a deletion does not.
    if (inserted > 0) return line;
    return null;
  }

  // The range started on an earlier line and extends into this one.
  return null;
}

function compareChangesDesc(a: TextChange, b: TextChange): number {
  if (a.startLine !== b.startLine) return b.startLine - a.startLine;
  return b.startChar - a.startChar;
}

/**
 * Apply a batch of pre-change, non-overlapping edits bottom-to-top.
 * Returns null when the line was deleted by one of the edits.
 */
export function shiftLineNumber(line: number, changes: readonly TextChange[]): number | null {
  const sorted = [...changes].sort(compareChangesDesc);
  let current: number | null = line;
  for (const change of sorted) {
    if (current === null) return null;
    current = shiftLineAfterChange(current, change);
  }
  return current;
}
