"use client";

/**
 * A chart's find field locates models without filtering any out. Each pill names one model by its exact name, or every model a partial name or `*` wildcard matches; the text being typed lights its matches, and choosing a suggestion, Enter, or a comma turns it into a pill, whose models the chart flares once and names.
 * A pill removes only itself, as Backspace in the empty field removes the last one. The chart owns which models are searchable, what locating does, and why typed text finds nothing; on compact charts the field folds to its icon, marked while it holds pills, until it takes focus.
 * `useChartFind` keeps a chart's pills in the URL, so a link carries them.
 */

import { Search, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  MAX_SUGGESTIONS,
  ModelSuggestionList,
  type ModelSuggestionRow,
  ModelSuggestionStatus,
  useModelSuggestions,
} from "../shared/ModelSuggestions";
import { filterSearchDocuments, hasSearchQuery, type SearchDocument } from "../shared/search";
import { type DashboardUrlKey, modelLinkId } from "../url-state";
import { replaceDashboardUrl, useUrlState } from "../use-url-state";

import styles from "./graphs.module.css";

export type ChartFindState = {
  /** The pills in the order they were added, each a model's exact name or a pattern naming every model it matches. */
  terms: readonly string[];
  /** The text being typed, which lights its matches without locating them. */
  draft: string;
  /** The models the pills name, in pill order and keyed as the chart keys them, each with the `performance.now()` it was located at for the sky's one-time flare. */
  located: ReadonlyMap<string, number>;
};

export const EMPTY_CHART_FIND: ChartFindState = { terms: [], draft: "", located: new Map() };

/**
 * A chart's find state with its pills in the URL under `key`: a pill naming one model is stored as its short id, `gemini-3.7-flash`, from the published id `identify` gives, so the link survives a rename; any other pill, or one whose model has no id, is stored as typed.
 * The text being typed stays on the page, and a model a link located flares once it is first on the chart; adding or removing a pill rewrites the current history entry, so Back leaves the page rather than stepping through pills.
 */
export function useChartFind<T>(
  key: Extract<DashboardUrlKey, `${string}-find`>,
  documents: readonly SearchDocument<T>[],
  describe: (item: T) => ModelSuggestionRow,
  identify: (item: T) => string | null,
): [ChartFindState, (next: ChartFindState) => void] {
  const [stored] = useUrlState(key);
  const [draft, setDraft] = useState("");
  const [times, setTimes] = useState<ChartFindState["located"]>(new Map());
  const find = useMemo((): ChartFindState => {
    const terms = stored.map((value) => {
      const model = documents.find((document) => {
        const id = identify(document.value);
        return id != null && modelLinkId(id) === value;
      });
      return model == null ? value : describe(model.value).name;
    });
    // A model the effect below has not stamped yet holds its flare until it is on the chart.
    const located = new Map(
      namedTargets(terms, documents, describe).map((item) => {
        const model = describe(item).key;
        return [model, times.get(model) ?? Number.NEGATIVE_INFINITY] as const;
      }),
    );
    return { terms, draft, located };
  }, [stored, documents, describe, identify, draft, times]);
  // Each pill's models are stamped a microsecond after the previous pill's, so the model found last is the last pill's first, as when the pills were added one by one.
  useEffect(() => {
    const at = performance.now();
    const stamps = new Map<string, number>();
    find.terms.forEach((term, index) => {
      for (const item of termTargets(term, documents, describe)) {
        const model = describe(item).key;
        if (!times.has(model) && !stamps.has(model)) stamps.set(model, at + index / 1000);
      }
    });
    if (stamps.size > 0) setTimes(new Map([...times, ...stamps]));
  }, [find, times, documents, describe]);
  const setFind = (next: ChartFindState) => {
    setDraft(next.draft);
    setTimes(next.located);
    replaceDashboardUrl({
      [key]: next.terms.map((term) => {
        const targets = termTargets(term, documents, describe);
        const id = targets.length === 1 ? identify(targets[0]!) : null;
        return id == null ? term : modelLinkId(id);
      }),
    });
  };
  return [find, setFind];
}

/** Every item the pills and the typed text name, the pills' first; `null` while the field holds neither. */
export function chartFindTargets<T>(
  find: ChartFindState,
  documents: readonly SearchDocument<T>[],
  describe: (item: T) => ModelSuggestionRow,
): T[] | null {
  const terms = [...find.terms, find.draft];
  return terms.some(hasSearchQuery) ? namedTargets(terms, documents, describe) : null;
}

/** The model the latest pill located, which a chart shows while nothing is pointed: a pill naming several takes its first, the strongest by Intelligence. */
export function lastLocated(located: ChartFindState["located"]): string | null {
  let last: [string, number] | null = null;
  for (const entry of located) if (last == null || entry[1] > last[1]) last = entry;
  return last?.[0] ?? null;
}

/** A caption's words for the models a find field brought in beyond the chart's own, null when it brought none: `with the model you found`, `with the 3 models you found`. */
export function foundModelsPhrase(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "with the model you found" : `with the ${count} models you found`;
}

/** The items one term names: a model whose name it spells exactly, or else every match, the highest Intelligence first. */
export function termTargets<T>(
  term: string,
  documents: readonly SearchDocument<T>[],
  describe: (item: T) => ModelSuggestionRow,
): T[] {
  const name = term.trim().toLocaleLowerCase("en");
  if (!name) return [];
  const exact = documents
    .map((document) => document.value)
    .filter((item) => describe(item).name.toLocaleLowerCase("en") === name);
  if (exact.length) return exact;
  return filterSearchDocuments(term, documents).sort(
    (left, right) => describe(right).intelligence - describe(left).intelligence,
  );
}

/** `onChange` also receives the models a change newly located, which a chart may need to bring into view; `nothingFound` says why the typed text names nothing the chart can locate. */
export function ChartFind<T>({
  label,
  find,
  documents,
  describe,
  onChange,
  nothingFound,
}: {
  label: string;
  find: ChartFindState;
  documents: readonly SearchDocument<T>[];
  describe: (item: T) => ModelSuggestionRow;
  onChange: (next: ChartFindState, located: readonly T[]) => void;
  nothingFound: (term: string) => ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const typed = termTargets(find.draft, documents, describe);
  const suggestions = typed
    .filter((item) => !find.located.has(describe(item).key))
    .slice(0, MAX_SUGGESTIONS);
  // Pills locate in their own order, so where labels crowd the first pill's models keep their names; a model keeps its flare time while any pill still names it.
  const change = (terms: readonly string[], draft: string) => {
    const unique = [...new Map(terms.map((term) => [term.toLocaleLowerCase("en"), term])).values()];
    const targets = namedTargets(unique, documents, describe);
    const at = performance.now();
    const located = new Map(
      targets.map((item) => {
        const key = describe(item).key;
        return [key, find.located.get(key) ?? at] as const;
      }),
    );
    onChange(
      { terms: unique, draft, located },
      targets.filter((item) => !find.located.has(describe(item).key)),
    );
  };
  // Entered names become pills; one that names nothing stays typed ahead of `typing`, so the field still says why.
  const enter = (text: string, typing: string) => {
    const entered = text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const naming = entered.filter((part) => termTargets(part, documents, describe).length > 0);
    const unnamed = entered.filter((part) => !naming.includes(part));
    change([...find.terms, ...naming], [...unnamed, typing.trimStart()].filter(Boolean).join(", "));
  };
  const remove = (index: number) => {
    change(
      find.terms.filter((_, at) => at !== index),
      find.draft,
    );
    input.current?.focus();
  };
  const suggestion = useModelSuggestions(`${id}-list`, suggestions, (item) =>
    change([...find.terms, describe(item).name], ""),
  );
  return (
    <div className={styles.chartFind} data-capture-exclude>
      <div className={styles.chartFindField}>
        <label htmlFor={`${id}-input`}>
          <Search size={15} aria-hidden="true" />
        </label>
        {find.terms.length ? <span className={styles.chartFindMark} aria-hidden="true" /> : null}
        {find.terms.map((term, index) => {
          const targets = termTargets(term, documents, describe);
          const model = targets.length === 1 ? describe(targets[0]!) : null;
          const name = model?.name ?? term;
          return (
            <button
              key={term}
              type="button"
              className={styles.chartFindTerm}
              aria-label={model ? `Remove ${name}` : `Remove ${name}, ${targets.length} models`}
              title={`Remove ${name}`}
              // Keep focus in the field, so a phone's open field never folds away between the tap and its click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => remove(index)}
            >
              {model?.logo ? <img src={model.logo} alt="" width={14} height={14} /> : null}
              <span>{name}</span>
              {model ? null : <small>· {targets.length}</small>}
              <X size={12} aria-hidden="true" />
            </button>
          );
        })}
        <input
          ref={input}
          id={`${id}-input`}
          type="search"
          aria-label={label}
          placeholder={find.terms.length ? "Add a model …" : "Locate models …"}
          title="Enter or a comma adds what you typed; * is a wildcard, and a partial name adds every model it matches."
          {...suggestion.inputProps}
          onKeyDown={(event) => {
            // With no suggestion chosen, Enter adds the typed text itself, which may name many models, rather than the first suggestion.
            if (event.key === "Enter" && suggestion.listProps.active < 0) {
              event.preventDefault();
              suggestion.hide();
              enter(find.draft, "");
              return;
            }
            if (event.key === "Backspace" && find.draft === "" && find.terms.length) {
              event.preventDefault();
              change(find.terms.slice(0, -1), "");
              return;
            }
            suggestion.inputProps.onKeyDown(event);
          }}
          value={find.draft}
          onChange={(event) => {
            const value = event.target.value;
            const comma = value.lastIndexOf(",");
            if (comma < 0) change(find.terms, value);
            else enter(value.slice(0, comma), value.slice(comma + 1));
            suggestion.show();
          }}
        />
      </div>
      {suggestion.listOpen ? (
        <ModelSuggestionList {...suggestion.listProps} describe={describe} />
      ) : suggestion.open && hasSearchQuery(find.draft) && typed.length === 0 ? (
        <ModelSuggestionStatus>{nothingFound(find.draft.trim())}</ModelSuggestionStatus>
      ) : null}
    </div>
  );
}

function namedTargets<T>(
  terms: readonly string[],
  documents: readonly SearchDocument<T>[],
  describe: (item: T) => ModelSuggestionRow,
): T[] {
  const named = new Map<string, T>();
  for (const term of terms) {
    for (const item of termTargets(term, documents, describe)) named.set(describe(item).key, item);
  }
  return [...named.values()];
}
