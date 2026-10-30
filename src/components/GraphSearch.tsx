import { useEffect, useRef } from "react";

interface GraphSearchProps {
  open: boolean;
  query: string;
  countLabel: string;
  /** JSONL line mode can search the file. Whole-document `.json` cannot. */
  lineSearch: boolean;
  onOpen: () => void;
  onClose: () => void;
  onQuery: (query: string) => void;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
}

export function GraphSearch({
  open,
  query,
  countLabel,
  lineSearch,
  onOpen,
  onClose,
  onQuery,
  onPrevMatch,
  onNextMatch,
  onPrevLine,
  onNextLine,
}: GraphSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <div className="jsonl-find">
        <button type="button" className="jsonl-find-open" onClick={onOpen}>
          Find
        </button>
      </div>
    );
  }

  return (
    <form
      className="jsonl-find jsonl-find-openpanel"
      role="search"
      onSubmit={event => {
        event.preventDefault();
        onNextMatch();
      }}
    >
      <input
        ref={inputRef}
        className="jsonl-find-input"
        type="text"
        placeholder="Find in graph"
        aria-label="Find in graph"
        value={query}
        onChange={event => onQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            onPrevMatch();
          }
        }}
      />
      <span className="jsonl-find-count" aria-live="polite">
        {countLabel}
      </span>
      <button
        type="button"
        className="jsonl-find-btn"
        aria-label="Previous match"
        onClick={onPrevMatch}
      >
        ↑
      </button>
      <button type="submit" className="jsonl-find-btn" aria-label="Next match">
        ↓
      </button>
      {lineSearch && (
        <>
          <button
            type="button"
            className="jsonl-find-text"
            aria-label="Previous line containing this text"
            title="Previous JSONL line containing this text"
            onClick={onPrevLine}
          >
            Prev line
          </button>
          <button
            type="button"
            className="jsonl-find-text"
            aria-label="Next line containing this text"
            title="Next JSONL line containing this text"
            onClick={onNextLine}
          >
            Next line
          </button>
        </>
      )}
      <button type="button" className="jsonl-find-btn" aria-label="Close search" onClick={onClose}>
        ×
      </button>
    </form>
  );
}
