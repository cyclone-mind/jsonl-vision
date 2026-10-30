// Matches inside the graph currently on screen. One match is one key, value,
// or header label that contains the query. Occurrences inside that text are
// highlighted together; Enter moves between these fields.

export interface GraphSearchRow {
  key?: string | null;
  value?: string | number | boolean | null;
  type?: string;
}

export interface GraphSearchNode {
  id: string;
  label?: string;
  text: GraphSearchRow[];
}

export type GraphMatchField = "label" | "key" | "value";

export interface GraphMatch {
  nodeId: string;
  /** -1 when the match is the node's header label. */
  rowIndex: number;
  field: GraphMatchField;
}

function includesQuery(text: string, query: string): boolean {
  if (!query) return false;
  return text.toLowerCase().includes(query);
}

function scalarText(row: GraphSearchRow): string | null {
  if (row.type === "object" || row.type === "array") return null;
  if (row.value === undefined) return null;
  if (row.value === null) return "null";
  return String(row.value);
}

/** Case-insensitive key and value matches, in graph order. Empty query matches nothing. */
export function findGraphMatches(nodes: readonly GraphSearchNode[], query: string): GraphMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: GraphMatch[] = [];
  for (const node of nodes) {
    if (node.label && includesQuery(node.label, needle)) {
      matches.push({ nodeId: node.id, rowIndex: -1, field: "label" });
    }
    node.text.forEach((row, rowIndex) => {
      if (row.key && includesQuery(row.key, needle)) {
        matches.push({ nodeId: node.id, rowIndex, field: "key" });
      }
      const value = scalarText(row);
      if (value != null && includesQuery(value, needle)) {
        matches.push({ nodeId: node.id, rowIndex, field: "value" });
      }
    });
  }
  return matches;
}

export function matchCountLabel(count: number, activeIndex: number): string {
  if (count === 0) return "No matches";
  if (activeIndex < 0) return count === 1 ? "1 match" : `${count} matches`;
  return `${activeIndex + 1} of ${count}`;
}

/** Next index in `count`, wrapping. `backward` steps the other way. `-1` starts at the first or last. */
export function stepMatchIndex(count: number, activeIndex: number, backward: boolean): number {
  if (count <= 0) return -1;
  if (activeIndex < 0) return backward ? count - 1 : 0;
  const delta = backward ? -1 : 1;
  return (activeIndex + delta + count) % count;
}
