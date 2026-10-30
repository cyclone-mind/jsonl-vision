import React from "react";
import type { NodeData } from "../types";
import { EditableValue } from "./EditableValue";
import { HighlightText } from "./HighlightText";
import styles from "./Node.module.css";
import { useSearchContext } from "./SearchContext";
import { TextRenderer } from "./TextRenderer";
import { getTextColor } from "./nodeStyles";

type TextNodeProps = {
  node: NodeData;
  x: number;
  y: number;
};

const TextNodeBase = ({ node, x, y }: TextNodeProps) => {
  const { text, width, height } = node;
  const search = useSearchContext();
  const query = search.query.trim();
  const firstRow = text[0];

  if (!firstRow) return null;

  const value = firstRow.value;
  const multiline = height > 36;

  // Primitive leaves (including array items like ["stack", 0]) are editable;
  // the array/object summary nodes ("[N items]" / "{0 keys}") are not.
  const isScalar = firstRow.type !== "object" && firstRow.type !== "array";
  const canEdit = isScalar && node.path != null;

  return (
    <foreignObject
      className={styles.foreignObject}
      data-id={`node-${node.id}`}
      width={width}
      height={height}
      x={0}
      y={0}
    >
      <span
        className={
          multiline ? `${styles.textNodeWrapper} ${styles.multiline}` : styles.textNodeWrapper
        }
        data-x={x}
        data-y={y}
        data-key={JSON.stringify(text)}
      >
        <span className={styles.key} style={{ color: getTextColor({ value, type: typeof value }) }}>
          {query && firstRow.type !== "object" && firstRow.type !== "array" ? (
            <HighlightText
              text={value == null ? "null" : String(value)}
              query={query}
              active={
                search.active?.nodeId === node.id &&
                search.active.rowIndex === 0 &&
                search.active.field === "value"
              }
            />
          ) : canEdit ? (
            <EditableValue path={node.path!} value={value} valueType={firstRow.type}>
              <TextRenderer>{value}</TextRenderer>
            </EditableValue>
          ) : (
            <TextRenderer>{value}</TextRenderer>
          )}
        </span>
      </span>
    </foreignObject>
  );
};

const propsAreEqual = (prev: TextNodeProps, next: TextNodeProps) => {
  return (
    prev.node.text === next.node.text &&
    prev.node.width === next.node.width &&
    prev.node.height === next.node.height
  );
};

export const TextNode = React.memo(TextNodeBase, propsAreEqual);
