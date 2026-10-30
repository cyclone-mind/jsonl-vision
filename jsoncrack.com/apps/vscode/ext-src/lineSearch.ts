// Find the next JSONL line whose raw text contains a query.
//
// This scans line text only. It does not JSON.parse, so a tens-of-MB file stays
// a straight string search that stops at the first hit. The current line is
// skipped so "next" always moves. The scan wraps once and then stops.

function lineHasQuery(text: string, queryLower: string): boolean {
  if (text.length < queryLower.length) return false;
  // Exact lowercase hit avoids allocating a second copy of a huge line.
  if (text.includes(queryLower)) return true;
  return text.toLowerCase().includes(queryLower);
}

/**
 * `from` is the 0-based line to start after. Returns the matching line, or
 * null when the query is blank or no other line contains it.
 */
export function findLineContaining(
  from: number,
  direction: 1 | -1,
  lineCount: number,
  query: string,
  textAt: (line: number) => string
): number | null {
  const needle = query.trim().toLowerCase();
  if (!needle || lineCount <= 0) return null;
  if (direction !== 1 && direction !== -1) return null;

  for (let step = 1; step < lineCount; step += 1) {
    let line = from + direction * step;
    if (line < 0) line += lineCount;
    else if (line >= lineCount) line -= lineCount;
    if (line < 0 || line >= lineCount) continue;
    if (lineHasQuery(textAt(line), needle)) return line;
  }
  return null;
}

/** Parse a 1-based line number for Go to Line. `line` in the ok result is 0-based. */
export function parseGoToLine(
  input: string,
  lineCount: number
): { ok: true; line: number } | { ok: false; message: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, message: "Enter a line number." };
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: "Enter a whole number of 1 or more." };
  const oneBased = Number(trimmed);
  if (!Number.isSafeInteger(oneBased) || oneBased < 1) {
    return { ok: false, message: "Enter a whole number of 1 or more." };
  }
  if (lineCount <= 0 || oneBased > lineCount) {
    return { ok: false, message: `This file has ${lineCount} lines.` };
  }
  return { ok: true, line: oneBased - 1 };
}
