function fileStem(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  const base = slash >= 0 ? fileName.slice(slash + 1) : fileName;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const safe = stem
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "graph";
}

/**
 * Default export name. `line` is 0-based; a whole-document graph omits it.
 * `events.jsonl` line 2 → `events-line-3.png`.
 */
export function exportFileName(
  fileName: string,
  line: number | null,
  extension: "png" | "svg"
): string {
  const stem = fileStem(fileName);
  const withLine = line == null || line < 0 ? stem : `${stem}-line-${line + 1}`;
  return `${withLine}.${extension}`;
}
