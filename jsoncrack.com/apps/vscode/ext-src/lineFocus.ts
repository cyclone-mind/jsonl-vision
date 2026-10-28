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
