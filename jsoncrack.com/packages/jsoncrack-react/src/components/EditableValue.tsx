import React from "react";
import type { JSONPath } from "jsonc-parser";
import type { NodeRow } from "../types";
import type { EditableScalar } from "./EditContext";
import { useEditContext } from "./EditContext";
import styles from "./EditableValue.module.css";

interface EditableValueProps {
  /** JSONPath of this value within the rendered document. */
  path: JSONPath;
  /** Current scalar value (used to prefill the input and detect no-op edits). */
  value: NodeRow["value"];
  /** Original scalar type, used to coerce the typed text back on commit. */
  valueType: NodeRow["type"];
  /** Normal (read) rendering of the value. */
  children: React.ReactNode;
}

type CoerceResult = { ok: true; value: EditableScalar } | { ok: false };

/**
 * Coerce the input text back to the row's original scalar type.
 * Non-finite numbers are rejected: `JSON.stringify` would persist them as `null`.
 */
export function coerceEditableScalar(input: string, type: NodeRow["type"]): CoerceResult {
  switch (type) {
    case "string":
      return { ok: true, value: input };
    case "number": {
      const n = Number(input);
      if (input.trim() === "" || !Number.isFinite(n)) return { ok: false };
      return { ok: true, value: n };
    }
    case "boolean": {
      if (input === "true") return { ok: true, value: true };
      if (input === "false") return { ok: true, value: false };
      return { ok: false };
    }
    default: {
      // null (or unknown): interpret loosely so a null can become another scalar.
      const t = input.trim();
      if (t === "" || t === "null") return { ok: true, value: null };
      if (t === "true") return { ok: true, value: true };
      if (t === "false") return { ok: true, value: false };
      const n = Number(t);
      if (t !== "" && Number.isFinite(n)) return { ok: true, value: n };
      return { ok: true, value: input };
    }
  }
}

/**
 * Wraps a scalar value so double-clicking turns it into an inline input that
 * commits on Enter/blur and cancels on Escape (ADR 0001 items 5-7). Editing is
 * only offered when the graph is given an `onEditValue` callback; otherwise it
 * renders its children verbatim and the node stays read-only.
 */
export const EditableValue = ({ path, value, valueType, children }: EditableValueProps) => {
  const { onEditValue } = useEditContext();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [invalid, setInvalid] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const editable = !!onEditValue;
  const multiline = valueType === "string" && String(value).includes("\n");
  const setInputRef = React.useCallback(
    (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      inputRef.current = element;
    },
    []
  );

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const begin = (event: React.MouseEvent) => {
    if (!editable) return;
    event.stopPropagation();
    event.preventDefault();
    setDraft(value === null ? "" : String(value));
    setInvalid(false);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setInvalid(false);
  };

  // Enter: commit, but keep the input open and flagged if the value is invalid.
  const commit = () => {
    const result = coerceEditableScalar(draft, valueType);
    if (!result.ok) {
      setInvalid(true);
      return;
    }
    setEditing(false);
    if (result.value !== value) onEditValue?.(path, result.value);
  };

  // Blur: commit if valid, otherwise revert rather than trap focus.
  const commitOrCancel = () => {
    const result = coerceEditableScalar(draft, valueType);
    if (!result.ok) {
      cancel();
      return;
    }
    setEditing(false);
    if (result.value !== value) onEditValue?.(path, result.value);
  };

  if (!editing) {
    if (!editable) return <>{children}</>;
    return (
      <span
        className={styles.editable}
        onDoubleClick={begin}
        // Keep single clicks on a value from reaching the reaflow node (which
        // would open the node modal / start a drag) so the value is edit-only.
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        title="Double-click to edit"
      >
        {children}
      </span>
    );
  }

  const inputClassName = invalid ? `${styles.input} ${styles.invalid}` : styles.input;
  const sharedProps = {
    className: inputClassName,
    value: draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      if (invalid) setInvalid(false);
    },
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onDoubleClick: (event: React.MouseEvent) => event.stopPropagation(),
    onBlur: commitOrCancel,
  };

  if (multiline) {
    return (
      <textarea
        {...sharedProps}
        ref={setInputRef}
        className={`${inputClassName} ${styles.textarea}`}
        rows={Math.min(12, Math.max(3, draft.split("\n").length))}
        aria-label="Edit multiline string"
        title="Ctrl+Enter to save, Escape to cancel"
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <input
      {...sharedProps}
      ref={setInputRef}
      // Size to content so the input stays roughly as wide as the value it
      // replaced; without this the browser default (~20 chars) overflows the
      // fixed-width node and the row renders a text-overflow ellipsis.
      size={Math.min(Math.max(draft.length + 1, 2), 60)}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
};
