import { createContext, useContext } from "react";

export type GraphMatchField = "label" | "key" | "value";

export interface ActiveGraphMatch {
  nodeId: string;
  rowIndex: number;
  field: GraphMatchField;
}

export interface GraphSearchState {
  /** Trimmed query. Empty means highlights are off. */
  query: string;
  active: ActiveGraphMatch | null;
}

const EMPTY: GraphSearchState = { query: "", active: null };

export const SearchContext = createContext<GraphSearchState>(EMPTY);

export const useSearchContext = (): GraphSearchState => useContext(SearchContext);
