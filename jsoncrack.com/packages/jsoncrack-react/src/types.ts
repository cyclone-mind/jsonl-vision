import type { JSONPath, Node } from "jsonc-parser";

export interface NodeRow {
  key: string | null;
  value: string | number | null | boolean;
  type: Node["type"];
  childrenCount?: number;
  to?: string[];
}

export interface NodeData {
  id: string;
  text: Array<NodeRow>;
  width: number;
  height: number;
  path?: JSONPath;
  parentKey?: string;
  parentType?: string;
}

export interface EdgeData {
  id: string;
  from: string;
  to: string;
  text: string | null;
  /**
   * Index of the row within the `from` node's `text` array that this edge
   * originates from (the key whose value is the child node). Used to anchor
   * the connector to that key's row instead of ELK's evenly-distributed
   * default exit point. `0` for single-row array container nodes.
   */
  fromRowIndex?: number;
}

export interface GraphData {
  nodes: NodeData[];
  edges: EdgeData[];
}

/** A node's laid-out rectangle in ELK/layout coordinate space. */
export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutDirection = "LEFT" | "RIGHT" | "DOWN" | "UP";

export type CanvasThemeMode = "light" | "dark";
