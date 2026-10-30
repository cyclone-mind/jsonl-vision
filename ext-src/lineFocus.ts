// Decide whether a cursor move should open or focus a JSONL line tab.
//
// The host used to ignore any move onto `lastFocusedLine`. That skipped two
// real transitions: reopening the current line after its tab was closed, and
// returning the editor cursor to a line whose tab is open but not focused
// (after the user clicked a different pill without the cursor following).

export type FocusLineDecision = "focus" | "ignore" | "skip-blank";

export function focusLineDecision(input: {
  line: number;
  /** Current document text of `line`, without the line break. */
  content: string;
  lastFocusedLine: number | null;
  focusedLine: number | null;
  /** 0-based lines that already have an open tab. */
  openLines: readonly number[];
}): FocusLineDecision {
  // JSONL records are non-empty lines. A blank line is not a record, and it
  // must not become the remembered cursor line — leaving it and coming back
  // to the previous record still has to focus that tab.
  if (input.content.trim() === "") return "skip-blank";

  const open = input.openLines.includes(input.line);
  if (open && input.line === input.lastFocusedLine && input.line === input.focusedLine) {
    return "ignore";
  }
  return "focus";
}

/**
 * Next or previous non-empty line. Blank lines are not records. `direction`
 * is `1` (toward the end) or `-1`. Returns null at the ends of the document.
 */
export function adjacentNonEmptyLine(
  from: number,
  direction: 1 | -1,
  lineCount: number,
  textAt: (line: number) => string
): number | null {
  if (direction !== 1 && direction !== -1) return null;
  for (let line = from + direction; line >= 0 && line < lineCount; line += direction) {
    if (textAt(line).trim() !== "") return line;
  }
  return null;
}
