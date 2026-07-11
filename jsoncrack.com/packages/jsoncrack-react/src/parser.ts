import { getNodePath, parseTree, type JSONPath, type Node, type ParseError } from "jsonc-parser";
import { HEADER_HEIGHT } from "./layoutConstants";
import type { EdgeData, GraphData, NodeData, NodeRow } from "./types";
import { calculateNodeSize } from "./utils/calculateNodeSize";

export interface ParseGraphResult extends GraphData {
  errors: ParseError[];
}

/** Extra width reserved for a container row's collapse control (item 11/16). */
const COLLAPSE_BTN_ALLOWANCE = 26;
/** Horizontal padding reserved around the header label. */
const HEADER_PADDING = 24;

/**
 * Header label for a node: the key it sits under, or `arr[i]` for an array
 * element. `undefined` for the root (empty path), which renders no header.
 */
const buildLabel = (path: JSONPath | undefined): string | undefined => {
  if (!path || path.length === 0) return undefined;
  const last = path[path.length - 1];
  if (typeof last === "number") {
    const parent = path[path.length - 2];
    return typeof parent === "string" ? `${parent}[${last}]` : `[${last}]`;
  }
  return String(last);
};

export const parseGraph = (json: string): ParseGraphResult => {
  const parseErrors: ParseError[] = [];
  const jsonTree = parseTree(json, parseErrors);

  if (!jsonTree) {
    return {
      nodes: [],
      edges: [],
      errors: parseErrors,
    };
  }

  const nodes: NodeData[] = [];
  const edges: EdgeData[] = [];
  let nodeId = 1;
  let edgeId = 1;

  function traverse(node: Node, parentId?: string): string | undefined {
    const id = String(nodeId++);
    const text: NodeRow[] = [];

    if (parentId !== undefined && node.parent?.type === "array") {
      // The parent is a single-row array container (`[N items]`), so this
      // element's connector originates from that lone row (index 0).
      edges.push({
        id: String(edgeId++),
        from: parentId,
        to: id,
        text: "",
        fromRowIndex: 0,
      });
    }

    const isArray = node.type === "array";
    const isRootArray = !node.parent || node.parent.type === "array";

    if (isArray && isRootArray) {
      const { width, height } = calculateNodeSize(`[${node.children?.length ?? "0"} items]`);

      nodes.push({
        id,
        text: [
          {
            key: null,
            value: `[${node.children?.length ?? 0} items]`,
            type: "array",
            childrenCount: node.children?.length,
          },
        ],
        width,
        height,
        path: [],
      });

      node.children?.forEach(child => {
        traverse(child, id);
      });

      return id;
    }

    node.children?.forEach(child => {
      if (!child.children || !child.children[1]) {
        traverse(child, id);
        return;
      }

      const key = child.children[0].value?.toString() ?? null;
      const valueNode = child.children[1];
      const type = valueNode.type;

      if (type === "array") {
        const targetIds: string[] = [];

        valueNode.children?.forEach(arrayChild => {
          const arrayChildId = traverse(arrayChild, undefined);
          if (arrayChildId) targetIds.push(arrayChildId);
        });

        text.push({
          key,
          value: valueNode.value as NodeRow["value"],
          type,
          to: targetIds.length > 0 ? targetIds : undefined,
          childrenCount: valueNode.children?.length,
        });

        // All of this array's item connectors leave from this key's row.
        const arrayRowIndex = text.length - 1;
        targetIds.forEach(targetId => {
          edges.push({
            id: String(edgeId++),
            from: id,
            to: targetId,
            text: key,
            fromRowIndex: arrayRowIndex,
          });
        });
      } else if (type === "object") {
        const objectNodeId = traverse(valueNode, id);

        text.push({
          key,
          value: valueNode.value as NodeRow["value"],
          type,
          childrenCount: Object.keys(valueNode.children ?? {}).length,
          ...(objectNodeId && { to: [objectNodeId] }),
        });

        const objectRowIndex = text.length - 1;
        if (objectNodeId) {
          edges.push({
            id: String(edgeId++),
            from: id,
            to: objectNodeId,
            text: key,
            fromRowIndex: objectRowIndex,
          });
        }
      } else {
        text.push({
          key,
          value: valueNode.value as NodeRow["value"],
          type,
        });
      }
    });

    if (node.parent?.type === "array" && node.type === "object" && node.children?.length === 0) {
      text.push({
        key: null,
        value: "{0 keys}",
        type: "object",
        childrenCount: 0,
      });
    }

    const appendParentKey = () => {
      const getParentKey = (targetNode: Node) => {
        const path = getNodePath(targetNode);
        return path?.pop()?.toString();
      };

      if (!node.parent) {
        return { parentKey: getParentKey(node), parentType: node.type };
      }

      if (node.parent.type === "array") {
        return { parentKey: getParentKey(node.parent), parentType: "array" };
      }

      if (node.parent.type === "property") {
        return { parentKey: getParentKey(node), parentType: "object" };
      }

      return {
        parentKey: getParentKey(node),
        parentType: node.parent.type.replace("property", "object"),
      };
    };

    if (text.length === 0) {
      if (typeof node.value === "undefined") return undefined;

      const { width, height } = calculateNodeSize(node.value as string | number);

      nodes.push({
        id,
        text: [
          {
            key: null,
            value: node.value as NodeRow["value"],
            type: node.type,
          },
        ],
        width,
        height,
        path: getNodePath(node),
        ...appendParentKey(),
      });
    } else {
      let displayText: string | [string, string][];

      if (text.some(row => row.key !== null)) {
        displayText = text.map(row => {
          const keyStr = row.key === null ? "" : row.key;

          if (row.type === "object") return [keyStr, `{${row.childrenCount ?? 0} keys}`];
          if (row.type === "array") return [keyStr, `[${row.childrenCount ?? 0} items]`];
          if (row.value === null) return [keyStr, "null"];

          return [keyStr, `${row.value}`];
        });
      } else {
        displayText = `${text[0].value}`;
      }

      const { width, height } = calculateNodeSize(displayText);

      const nodePath = getNodePath(node);
      const label = buildLabel(nodePath);

      // Reserve width for the container-row collapse control so rows like
      // `nested: {1 keys}` aren't clipped to `…`, and for the header label; add
      // the header band's height when a label is present.
      const hasContainerRow = text.some(
        row => (row.type === "object" || row.type === "array") && (row.childrenCount ?? 0) > 0
      );
      let nodeWidth = hasContainerRow ? width + COLLAPSE_BTN_ALLOWANCE : width;
      let nodeHeight = height;
      if (label) {
        nodeWidth = Math.max(nodeWidth, calculateNodeSize(label).width + HEADER_PADDING);
        nodeHeight += HEADER_HEIGHT;
      }

      nodes.push({
        id,
        text,
        width: nodeWidth,
        height: nodeHeight,
        path: nodePath,
        label,
        depth: nodePath?.length ?? 0,
        ...appendParentKey(),
      });
    }

    return id;
  }

  traverse(jsonTree);

  return {
    nodes,
    edges,
    errors: parseErrors,
  };
};
