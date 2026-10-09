"use client";

/** Model suggestions for a search field: the strongest collapsed models a query admits, offered as a combobox's options that open their model sheet. The rail's global search and the sheet's compare search share them. */

import { type CSSProperties, type KeyboardEvent, useState } from "react";

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { formatScore } from "../table/format";
import { BrainIcon } from "./DashboardIcons";
import {
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  modelLogo,
  modelName,
  modelsForVariantDisplay,
} from "./model-display";
import { providerBrandColor } from "./provider-theme";
import { hasSearchQuery } from "./search";

import styles from "./model-suggestions.module.css";

const MAX_SUGGESTIONS = 6;

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
  return filterByGlobalModelFilters(
    modelsForVariantDisplay(models, false),
    (model) => model,
    filters,
    {
      observedAtEpochSeconds: fetchedAt,
      rankingModels: models,
    },
  )
    .sort(
      (left, right) =>
        Number(exact(right)) - Number(exact(left)) ||
        (right.scores.intelligence_score ?? -1) - (left.scores.intelligence_score ?? -1),
    )
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Combobox behaviour for a search that suggests models, keyed to the listbox `id`.
 * Arrows move through the suggestions, wrapping at either end and reopening a closed list; Enter picks the chosen match, or the first; the first Escape only closes the list and keeps the search's text.
 */
export function useModelSuggestions(
  id: string,
  suggestions: readonly ModelAtlasModel[],
  choose: (model: ModelAtlasModel) => void,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listOpen = open && suggestions.length > 0;
  const pick = (model: ModelAtlasModel) => {
    setOpen(false);
    setActive(-1);
    choose(model);
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
    /** Typing reopens the list with nothing chosen yet. */
    show: () => {
      setOpen(true);
      setActive(-1);
    },
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

/** The listbox beneath a model search: each match with its provider mark and Intelligence, the chosen one traced in its provider colour. */
export function ModelSuggestionList({
  id,
  suggestions,
  active,
  onActive,
  onPick,
}: {
  id: string;
  suggestions: readonly ModelAtlasModel[];
  active: number;
  onActive: (index: number) => void;
  onPick: (model: ModelAtlasModel) => void;
}) {
  return (
    <ul id={id} className={styles.suggestions} role="listbox" aria-label="Matching models">
      {suggestions.map((model, index) => {
        const logo = modelLogo(model);
        return (
          <li
            key={model.id ?? model.name}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            style={{ "--row-provider": providerBrandColor(model.provider) } as CSSProperties}
            // Keep focus in the search so choosing never blurs and closes the list first.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onActive(index)}
            onClick={() => onPick(model)}
          >
            {logo ? (
              <img className={styles.logo} src={logo} alt="" width={16} height={16} />
            ) : (
              <span className={styles.logo} aria-hidden="true" />
            )}
            <span className={styles.name}>{modelName(model)}</span>
            <span className={styles.score}>
              <BrainIcon />
              <span className="visually-hidden">Intelligence</span>
              {formatScore(model.scores.intelligence_score)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
