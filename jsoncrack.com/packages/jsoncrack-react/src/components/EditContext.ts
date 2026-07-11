import { createContext, useContext } from "react";
import type { JSONPath } from "jsonc-parser";

/** A JSON leaf value that can be edited inline. */
export type EditableScalar = string | number | boolean | null;

export interface EditContextValue {
  /**
   * Called when a scalar leaf is edited and committed. `path` is the JSONPath of
   * the value within the currently rendered document; `newValue` is already
   * coerced to the row's original scalar type. Absent means editing is disabled
   * (the graph stays read-only, as upstream JSON Crack is).
   */
  onEditValue?: (path: JSONPath, newValue: EditableScalar) => void;
}

const EMPTY: EditContextValue = {};

export const EditContext = createContext<EditContextValue>(EMPTY);

export const useEditContext = (): EditContextValue => useContext(EditContext);
