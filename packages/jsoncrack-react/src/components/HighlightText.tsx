import React from "react";
import styles from "./Node.module.css";

interface HighlightTextProps {
  text: string;
  query: string;
  active?: boolean;
}

/** Case-insensitive literal highlights. The query is not a regular expression. */
export const HighlightText = ({ text, query, active = false }: HighlightTextProps) => {
  if (!query) return <>{text}</>;
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let hit = 0;
  while (cursor < text.length) {
    const at = haystack.indexOf(needle, cursor);
    if (at < 0) {
      parts.push(text.slice(cursor));
      break;
    }
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark
        key={`${at}-${hit}`}
        className={active ? `${styles.hit} ${styles.hitActive}` : styles.hit}
      >
        {text.slice(at, at + needle.length)}
      </mark>
    );
    hit += 1;
    cursor = at + needle.length;
    if (needle.length === 0) break;
  }
  return <>{parts}</>;
};
