"use client";

/** The sheet's compare search: while a pinned model waits for a partner, it suggests models to open beside it without leaving the sheet. */

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { DEFAULT_PROFILE_FILTERS } from "../model-profiles";
import {
  ModelSuggestionList,
  modelSuggestions,
  useModelSuggestions,
} from "../shared/ModelSuggestions";
import { familyName, type SheetEntry } from "./entries";
import { openModelSheet } from "./open";

import styles from "./model-sheet.module.css";

const SUGGESTIONS_ID = "model-sheet-compare-suggestions";

/**
 * Search every model in the snapshot, whatever the dashboard's filters hide, since a comparison may cross them; the pinned model is never offered against itself.
 * The field takes focus when the Compare toggle just put it on screen, so a keyboard reader can type the partner's name at once.
 */
export function CompareSearch({
  pinned,
  models,
}: {
  pinned: SheetEntry;
  models: ModelAtlasModel[];
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const family = canonicalModelKey(pinned.row.model);
  const suggestions = useMemo(
    () =>
      modelSuggestions(models, { ...DEFAULT_PROFILE_FILTERS, q: query }, null).filter(
        (model) => canonicalModelKey(model) !== family,
      ),
    [models, query, family],
  );
  const suggestion = useModelSuggestions(SUGGESTIONS_ID, suggestions, (model) => {
    setQuery("");
    openModelSheet({ ...model, reasoning_effort: null });
  });

  useEffect(() => {
    if (document.activeElement?.closest("[data-compare-toggle]") != null) {
      inputRef.current?.focus();
    }
  }, []);

  return (
    <div className={styles.compareSearch} data-capture-exclude>
      {/* The suggestions hang from the field itself, over the evidence below the head. */}
      <div className={styles.compareQuery}>
        <label className={styles.compareField}>
          <Search size={14} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            aria-label={`Compare ${familyName(pinned)} with`}
            placeholder={`Compare ${familyName(pinned)} with…`}
            {...suggestion.inputProps}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              suggestion.show();
            }}
          />
        </label>
        {suggestion.listOpen ? <ModelSuggestionList {...suggestion.listProps} /> : null}
      </div>
      <p className={styles.pinNote}>Or open another model from any row, star, or role.</p>
    </div>
  );
}
