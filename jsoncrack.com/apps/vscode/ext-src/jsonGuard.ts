// Decide whether a JSON text should be sent to the graph.
//
// Invalid text used to render as a blank canvas (the webview never surfaced
// parse errors). A wide array was fully turned into nodes before the 1500-node
// cap rejected it, which freezes the webview. Depth is capped here because the
// graph walk is recursive. The character cap is only a last resort for payloads
// large enough to stall the editor; long strings well below it still graph.

export const DEFAULT_MAX_JSON_CHARS = 4_000_000;
export const DEFAULT_MAX_JSON_DEPTH = 400;

export type JsonGraphKind = "line" | "document" | "selection";

export interface JsonGuardOptions {
  kind?: JsonGraphKind;
  maxChars?: number;
  maxDepth?: number;
}

const KIND_NOUN: Record<JsonGraphKind, string> = {
  line: "line",
  document: "document",
  selection: "selection",
};

/** Nesting of `{` / `[` outside of strings. A long string of braces does not count. */
export function jsonNestingDepth(text: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth += 1;
      if (depth > max) max = depth;
    } else if ((ch === "}" || ch === "]") && depth > 0) {
      depth -= 1;
    }
  }

  return max;
}

/** `null` when the text is safe to graph. Empty text is safe: it means no record is focused. */
export function jsonGraphProblem(text: string, options: JsonGuardOptions = {}): string | null {
  if (text.trim() === "") return null;

  const kind = options.kind ?? "document";
  const noun = KIND_NOUN[kind];
  const maxChars = options.maxChars ?? DEFAULT_MAX_JSON_CHARS;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_JSON_DEPTH;

  if (text.length > maxChars) {
    return `This ${noun} is ${text.length.toLocaleString("en-US")} characters, above the ${maxChars.toLocaleString("en-US")} character limit, so it was not graphed.`;
  }

  const depth = jsonNestingDepth(text);
  if (depth > maxDepth) {
    return `This ${noun} is nested ${depth.toLocaleString("en-US")} levels, above the ${maxDepth.toLocaleString("en-US")} level limit, so it was not graphed.`;
  }

  try {
    JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON";
    return `This ${noun} is not valid JSON (${detail}).`;
  }

  return null;
}

/** Payload posted to the webview. A problem sends no JSON text, so a huge line never crosses into the webview. */
export function graphPayload(
  text: string,
  kind: JsonGraphKind
): { json: string; problem: string | null } {
  const problem = jsonGraphProblem(text, { kind });
  return { json: problem ? "" : text, problem };
}
