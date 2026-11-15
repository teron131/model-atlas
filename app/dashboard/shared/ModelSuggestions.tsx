"use client";

/** Model suggestions for a search field: the strongest models a query admits, offered as a combobox's options. The rail's global search, the sheet's compare search, and the charts' find fields share them; each caller decides what choosing one does. */

import { type CSSProperties, type KeyboardEvent, type ReactNode, useState } from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { collapsedModels } from "../../../src/model-atlas/stats/model-variants";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { BrainIcon } from "../../shared/DashboardMarks";
import { formatScore } from "../table/format";
import { modelLogo, modelName } from "./model-display";
import { filterByGlobalModelFilters, type GlobalModelFilters } from "./model-filters";
import { providerBrandColor } from "./provider-theme";
import { hasSearchQuery } from "./search";

import styles from "./model-suggestions.module.css";

export const MAX_SUGGESTIONS = 6;

/** What a suggestion row shows: its lab's logo and trace colour, its name, and its Intelligence. */
export type ModelSuggestionRow = {
  key: string;
  name: string;
  provider: string | null;
  /** An empty string leaves the logo's place blank. */
  logo: string;
  intelligence: number;
};

export function modelSuggestionRow(model: ModelAtlasModel): ModelSuggestionRow {
  return {
    key: canonicalModelKey(model),
    name: modelName(model),
    provider: model.provider,
    logo: modelLogo(model),
    intelligence: model.scores.intelligence_score,
  };
}

/**
 * The strongest collapsed models the search and filters admit, an exact name or id first.
 * Suggestions read the same filter pipeline as every view, so a list never offers a model those filters hide.
 */
export function modelSuggestions(
  models: ModelAtlasModel[],
  filters: GlobalModelFilters,
  fetchedAt: number | null,
): ModelAtlasModel[] {
  if (!hasSearchQuery(filters.q)) return [];
  const query = filters.q.trim().toLocaleLowerCase("en");
  const exact = (model: ModelAtlasModel) =>
    model.id?.toLocaleLowerCase("en") === query || model.name?.toLocaleLowerCase("en") === query;
  return filterByGlobalModelFilters(collapsedModels(models), (model) => model, filters, {
    observedAtEpochSeconds: fetchedAt,
    rankingModels: models,
  })
    .sort(
      (left, right) =>
        Number(exact(right)) - Number(exact(left)) ||
        right.scores.intelligence_score - left.scores.intelligence_score,
    )
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Combobox behaviour for a search that suggests models, keyed to the listbox `id`.
 * Arrows move through the suggestions, wrapping at either end and reopening a closed list; Enter picks the chosen match, or the first; the first Escape only closes the list and keeps the search's text.
 */
export function useModelSuggestions<T>(
  id: string,
  suggestions: readonly T[],
  choose: (item: T) => void,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listOpen = open && suggestions.length > 0;
  const pick = (item: T) => {
    setOpen(false);
    setActive(-1);
    choose(item);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive((index) => {
        if (!listOpen || index < 0) return step > 0 ? 0 : suggestions.length - 1;
        return (index + step + suggestions.length) % suggestions.length;
      });
    } else if (event.key === "Enter" && listOpen) {
      event.preventDefault();
      pick(suggestions[active] ?? suggestions[0]!);
    } else if (event.key === "Escape" && listOpen) {
      event.preventDefault();
      setOpen(false);
    }
  };
  return {
    listOpen,
    /** Whether the field was typed in since the list last closed, which a caller reads to say why nothing matches. */
    open,
    /** Typing reopens the list with nothing chosen yet. */
    show: () => {
      setOpen(true);
      setActive(-1);
    },
    hide: () => setOpen(false),
    /** The search input's combobox attributes and handlers; the caller keeps its own value and change handler. */
    inputProps: {
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-expanded": listOpen,
      "aria-controls": id,
      "aria-activedescendant": listOpen && active >= 0 ? `${id}-${active}` : undefined,
      autoComplete: "off",
      spellCheck: false,
      onKeyDown,
      onBlur: () => setOpen(false),
    },
    /** The props for `ModelSuggestionList`, shown while `listOpen`. */
    listProps: { id, suggestions, active, onActive: setActive, onPick: pick },
  };
}

export function ModelSuggestionList<T>({
  id,
  suggestions,
  active,
  onActive,
  onPick,
  describe,
}: {
  id: string;
  suggestions: readonly T[];
  active: number;
  onActive: (index: number) => void;
  onPick: (item: T) => void;
  describe: (item: T) => ModelSuggestionRow;
}) {
  return (
    <ul id={id} className={styles.suggestions} role="listbox" aria-label="Matching models">
      {suggestions.map((item, index) => {
        const row = describe(item);
        return (
          <li
            key={row.key}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            style={{ "--row-provider": providerBrandColor(row.provider) } as CSSProperties}
            // Keep focus in the search so choosing never blurs and closes the list first.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onActive(index)}
            onClick={() => onPick(item)}
          >
            {row.logo ? (
              <img className={styles.logo} src={row.logo} alt="" width={16} height={16} />
            ) : (
              <span className={styles.logo} aria-hidden="true" />
            )}
            <span className={styles.name}>{row.name}</span>
            <span className={styles.score}>
              <BrainIcon />
              <span className="visually-hidden">Intelligence</span>
              {formatScore(row.intelligence)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Says, in the suggestions' place, why a query offers nothing to choose. */
export function ModelSuggestionStatus({ children }: { children: ReactNode }) {
  return (
    <p className={`${styles.suggestions} ${styles.status}`} role="status">
      {children}
    </p>
  );
}
