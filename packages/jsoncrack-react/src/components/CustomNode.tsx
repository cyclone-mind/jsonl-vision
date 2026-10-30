import React from "react";
import type { NodeProps } from "reaflow";
import { Node } from "reaflow";
import type { NodeData } from "../types";
import { ObjectNode } from "./ObjectNode";
import { useSearchContext } from "./SearchContext";
import { TextNode } from "./TextNode";

type CustomNodeProps = NodeProps<NodeData> & {
  onNodeClick?: (node: NodeData) => void;
};

/** Rounded-card corner radius (ADR 0001 item 12); kept in sync with `--node-radius`. */
const NODE_CORNER_RADIUS = 10;

const CustomNodeBase = ({ onNodeClick, ...nodeProps }: CustomNodeProps) => {
  const search = useSearchContext();
  const active = search.active?.nodeId === nodeProps.properties.id && search.query.trim() !== "";
  const handleNodeClick = React.useCallback(
    (_: React.MouseEvent<SVGGElement, MouseEvent>, data: NodeData) => {
      onNodeClick?.(data);
    },
    [onNodeClick]
  );

  return (
    <Node
      {...nodeProps}
      onClick={handleNodeClick as any}
      animated={false}
      label={null as any}
      rx={NODE_CORNER_RADIUS}
      ry={NODE_CORNER_RADIUS}
      onEnter={event => {
        event.currentTarget.style.stroke = "var(--accent)";
      }}
      onLeave={event => {
        event.currentTarget.style.stroke = active ? "#e0a86b" : "var(--node-stroke)";
      }}
      style={{
        fill: "var(--node-fill)",
        stroke: active ? "#e0a86b" : "var(--node-stroke)",
        strokeWidth: active ? 2 : 1,
      }}
    >
      {({ node, x, y }) => {
        if (nodeProps.properties.text[0]?.key == null) {
          return <TextNode node={nodeProps.properties as NodeData} x={x} y={y} />;
        }

        return <ObjectNode node={node as NodeData} x={x} y={y} />;
      }}
    </Node>
  );
};

export const CustomNode = React.memo(CustomNodeBase);
