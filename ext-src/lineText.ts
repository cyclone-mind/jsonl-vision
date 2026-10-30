export { describeEditFailure, readScalarEdit } from "./applyEdit";

/** Drop a leading UTF-8 BOM from line 0. `JSON.parse` rejects it, so the first record would not graph or edit. */
export function normalizeDocumentLine(line: number, text: string): string {
  if (line === 0 && text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}
