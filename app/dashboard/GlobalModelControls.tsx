"use client";

/** The rail always shows the global model search, which suggests matching models to open directly; active filters, profiles, and additional filters sit beside it on wide screens and fold behind a toggle on phones, while secondary choices float above the page. */

import {
  AlertCircle,
  Bookmark,
  Boxes,
  Check,
  ChevronDown,
  CopyPlus,
  Ellipsis,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ModelAtlasModel } from "../../src/model-atlas/stats/types";
import { fmtMoney } from "./graphs/format";
import {
  DEFAULT_PROFILE_FILTERS,
  matchingProfileModelCount,
  MODEL_PROFILES_STORAGE_KEY,
  type ModelProfile,
  readModelProfiles,
  removeModelProfile,
  sameProfileFilters,
  saveModelProfile,
} from "./model-profiles";
import { openModelSheet } from "./model-sheet/open";
import { BrainIcon } from "./shared/DashboardIcons";
import {
  costFilterOptions,
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  modelLogo,
  modelName,
  modelRankFilterOptions,
  modelsForVariantDisplay,
  type ProviderOption,
  recencyFilterOptions,
} from "./shared/model-display";
import { providerBrandColor, providerLogo } from "./shared/provider-theme";
import { hasSearchQuery } from "./shared/search";
import { formatScore } from "./table/format";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

import styles from "./global-model-controls.module.css";

const MODEL_SEARCH_ID = "global-model-search";
const MODEL_SUGGESTIONS_ID = "global-model-suggestions";
const MAX_SUGGESTIONS = 6;
// A pinned rail keeps its search this close to the viewport top; anywhere lower, the rail has not reached the top yet.
const PINNED_SEARCH_TOP = 64;

/** One active global filter, shown as a chip that removes only itself. */
type FilterChip = { key: string; label: string; logo?: string; remove: GlobalModelFilters };

/**
 * Focus the rail's model search from anywhere, selecting any current query so typing replaces it.
 * Until the rail is pinned, as in the hero, the leaderboard scrolls up beneath it first, so results are in view while typing.
 */
export function focusModelSearch() {
  const input = document.getElementById(MODEL_SEARCH_ID);
  if (!(input instanceof HTMLInputElement)) return;
  if (input.getBoundingClientRect().top > PINNED_SEARCH_TOP) {
    document.getElementById("leaderboard")?.scrollIntoView({ block: "start" });
  }
  input.focus({ preventScroll: true });
  input.select();
}

/** Validate the current full model group before every create/update, even while the charts are rendering a deferred configuration. */
export function GlobalModelControls({
  filters,
  models,
  fetchedAt,
  providerChoices,
  showReasoningVariants,
  onShowReasoningVariantsChange,
}: {
  filters: GlobalModelFilters;
  models: ModelAtlasModel[];
  fetchedAt: number | null;
  providerChoices: ProviderOption[];
  showReasoningVariants: boolean;
  onShowReasoningVariantsChange: (show: boolean) => void;
}) {
  const [tableVariants] = useUrlState("table-variants");
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [storageError, setStorageError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({
    left: 0,
    top: 0,
    maxHeight: 440,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menu, setMenu] = useState<"profiles" | "filters">("profiles");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const matchedCount = useMemo(
    () => matchingProfileModelCount(models, filters, fetchedAt),
    [models, fetchedAt, filters],
  );
  const suggestions = useMemo(
    () => modelSuggestions(models, filters, fetchedAt),
    [models, fetchedAt, filters],
  );
  const suggestionsOpen = suggesting && suggestions.length > 0;
  const activeProfile = profiles.find((profile) => profile.id === activeId);
  const isDefault = sameProfileFilters(filters, DEFAULT_PROFILE_FILTERS);
  const modified = activeProfile != null && !sameProfileFilters(activeProfile.filters, filters);
  const canSave = storageReady && matchedCount > 0;
  const chips = filterChips(filters, providerChoices);

  useEffect(() => {
    const read = () => {
      try {
        setProfiles(readModelProfiles(window.localStorage));
        setStorageReady(true);
        setStorageError("");
      } catch {
        setStorageReady(false);
        setStorageError(
          "Browser profiles are unavailable. Check that site storage is enabled and saved profiles are valid.",
        );
      }
    };
    read();
    const changed = (event: StorageEvent) => {
      if (event.key === MODEL_PROFILES_STORAGE_KEY || event.key === null) read();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  useEffect(() => {
    if (saveOpen) nameRef.current?.focus();
  }, [saveOpen]);

  // "/" reaches the model search from anywhere except while typing in another field.
  useEffect(() => {
    const focusOnSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.matches("input, textarea, select"))
      ) {
        return;
      }
      event.preventDefault();
      focusModelSearch();
    };
    document.addEventListener("keydown", focusOnSlash);
    return () => document.removeEventListener("keydown", focusOnSlash);
  }, []);

  // A fixed popover must close when its toolbar moves, while its own list remains scrollable.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      menuRef.current?.hidePopover();
    };
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!open && !saveOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || menuRef.current?.matches(":popover-open")) return;
      if (saveOpen) setSaveOpen(false);
      else {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, saveOpen]);

  const apply = (next: GlobalModelFilters) => {
    updateDashboardUrl(next);
    setMessage("");
    setSaveError("");
  };

  /** A suggestion opens its collapsed model's sheet and leaves the search, and so the filtered views, as typed. */
  const openSuggestion = (model: ModelAtlasModel) => {
    setSuggesting(false);
    setActiveSuggestion(-1);
    openModelSheet({ ...model, reasoning_effort: null });
  };

  /** Arrows move through the suggestions, wrapping at either end and reopening a closed list; Enter opens the chosen match, or the first; the first Escape only closes the list and keeps the search's text. */
  const navigateSuggestions = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSuggesting(true);
      setActiveSuggestion((index) => {
        if (!suggestionsOpen || index < 0) return step > 0 ? 0 : suggestions.length - 1;
        return (index + step + suggestions.length) % suggestions.length;
      });
    } else if (event.key === "Enter" && suggestionsOpen) {
      event.preventDefault();
      openSuggestion(suggestions[activeSuggestion] ?? suggestions[0]!);
    } else if (event.key === "Escape" && suggestionsOpen) {
      event.preventDefault();
      setSuggesting(false);
    }
  };

  /** Read storage again before writing so another tab's edits are retained. */
  const save = (updating: boolean) => {
    if (!canSave) return;
    setSaveError("");
    try {
      const stored = readModelProfiles(window.localStorage);
      const existing = updating ? stored.find((profile) => profile.id === activeId) : undefined;
      if (updating && !existing)
        throw new Error("This profile was removed. Save it with a new name.");
      const profile: ModelProfile = {
        id: existing?.id ?? window.crypto.randomUUID(),
        name: existing?.name ?? name,
        filters,
      };
      const next = saveModelProfile(window.localStorage, stored, profile, matchedCount);
      setProfiles(next);
      setActiveId(profile.id);
      setSaveOpen(false);
      setName("");
      setMessage(updating ? "Profile updated." : "Profile saved.");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "The profile could not be saved in this browser.",
      );
    }
  };

  const remove = () => {
    if (!storageReady || activeProfile == null) return;
    setSaveError("");
    try {
      const stored = readModelProfiles(window.localStorage);
      setProfiles(removeModelProfile(window.localStorage, stored, activeProfile.id));
      setActiveId("");
      setSaveOpen(false);
      setMessage("Profile removed. Current filters kept.");
    } catch {
      setSaveError("The profile could not be removed from this browser.");
    }
  };

  const openSave = () => {
    setSaveOpen(true);
    setMessage("");
    setSaveError("");
  };

  const toggleMenu = (button: HTMLButtonElement, next: "profiles" | "filters") => {
    if (menuRef.current?.matches(":popover-open") && menu === next) {
      menuRef.current.hidePopover();
      return;
    }
    const box = button.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - 8;
    const above = box.top - 8;
    const opensAbove = below < 200 && above > below;
    const maxHeight = Math.max(
      0,
      Math.min(440, window.innerHeight * 0.6, opensAbove ? above : below),
    );
    setMenuPosition({
      left: Math.max(8, Math.min(box.right - 300, window.innerWidth - 308)),
      top: opensAbove ? undefined : box.bottom,
      bottom: opensAbove ? window.innerHeight - box.top : undefined,
      maxHeight,
    });
    setMenu(next);
    menuRef.current?.showPopover();
  };

  return (
    <>
      <div className={styles.query}>
        <label className={styles.search}>
          <Search size={15} aria-hidden="true" />
          {/* Typing filters every view as before and also lists the strongest matches; arrows choose one and Enter opens its sheet, the first match when none is chosen. */}
          <input
            id={MODEL_SEARCH_ID}
            type="search"
            role="combobox"
            aria-label="Global model search"
            aria-keyshortcuts="/"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls={MODEL_SUGGESTIONS_ID}
            aria-activedescendant={
              suggestionsOpen && activeSuggestion >= 0
                ? `${MODEL_SUGGESTIONS_ID}-${activeSuggestion}`
                : undefined
            }
            placeholder="Search models…"
            title="Use * as a wildcard; separate alternatives with commas. Press / to search from anywhere."
            autoComplete="off"
            spellCheck={false}
            value={filters.q}
            onChange={(event) => {
              updateDashboardUrl({ q: event.target.value }, true);
              setSuggesting(true);
              setActiveSuggestion(-1);
              setMessage("");
              setSaveError("");
            }}
            onBlur={() => setSuggesting(false)}
            onKeyDown={navigateSuggestions}
          />
          {/* The count stays mounted as a live region; while no filter applies, the "/" keycap takes its place on screen. */}
          <output
            className={isDefault ? styles.visuallyHidden : undefined}
            aria-live="polite"
            aria-label={`${matchedCount} matching models`}
            title={`${matchedCount} matching models`}
          >
            {matchedCount}
          </output>
          {isDefault ? (
            <kbd className={styles.shortcut} aria-hidden="true">
              /
            </kbd>
          ) : null}
        </label>
        {suggestionsOpen ? (
          <ul
            id={MODEL_SUGGESTIONS_ID}
            className={styles.suggestions}
            role="listbox"
            aria-label="Matching models"
          >
            {suggestions.map((model, index) => {
              const logo = modelLogo(model);
              return (
                <li
                  key={model.id ?? model.name}
                  id={`${MODEL_SUGGESTIONS_ID}-${index}`}
                  role="option"
                  aria-selected={index === activeSuggestion}
                  style={{ "--row-provider": providerBrandColor(model.provider) } as CSSProperties}
                  // Keep focus in the search so choosing never blurs and closes the list first.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSuggestion(index)}
                  onClick={() => openSuggestion(model)}
                >
                  {logo ? (
                    <img className={styles.providerLogo} src={logo} alt="" width={16} height={16} />
                  ) : (
                    <span className={styles.providerLogo} aria-hidden="true" />
                  )}
                  <span className={styles.suggestionName}>{modelName(model)}</span>
                  <span className={styles.suggestionScore}>
                    <BrainIcon />
                    <span className={styles.visuallyHidden}>Intelligence</span>
                    {formatScore(model.scores.intelligence_score)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label="Profiles and filters"
        title="Profiles and filters"
        aria-controls="global-model-filters"
        aria-expanded={open}
        onClick={() => {
          menuRef.current?.hidePopover();
          setOpen(!open);
        }}
      >
        <Ellipsis size={18} aria-hidden="true" />
        {activeProfile != null || chips.length ? <span className={styles.activeDot} /> : null}
      </button>
      <div
        id="global-model-filters"
        className={styles.panel}
        data-open={open}
        role="group"
        aria-label="Profiles and filters"
      >
        {chips.length ? (
          <div className={styles.chips} role="group" aria-label="Active filters">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={styles.chip}
                aria-label={`Remove filter: ${chip.label}`}
                title={`Remove ${chip.label}`}
                onClick={() => apply(chip.remove)}
              >
                {chip.logo ? (
                  <img
                    className={styles.providerLogo}
                    src={chip.logo}
                    alt=""
                    width={14}
                    height={14}
                  />
                ) : null}
                <span>{chip.label}</span>
                <X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.profiles}>
          {saveOpen ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save(false);
              }}
            >
              <input
                ref={nameRef}
                aria-label="Profile name"
                placeholder="Profile name"
                aria-invalid={saveError ? true : undefined}
                aria-describedby={saveError ? "global-profile-error" : undefined}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <button
                type="submit"
                className={styles.iconButton}
                disabled={!canSave || !name.trim()}
                aria-label="Save profile"
                title="Save profile"
              >
                <Check size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Cancel saving profile"
                title="Cancel"
                onClick={() => setSaveOpen(false)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                className={styles.profileToggle}
                aria-label="Profiles"
                title={
                  activeProfile
                    ? `${activeProfile.name} · Profiles`
                    : "Load and manage browser profiles"
                }
                aria-expanded={menuOpen && menu === "profiles"}
                aria-controls="global-filter-menu"
                popoverTarget="global-filter-menu"
                onClick={(event) => {
                  event.preventDefault();
                  toggleMenu(event.currentTarget, "profiles");
                }}
              >
                <Bookmark size={15} aria-hidden="true" />
                <span>
                  {activeProfile ? `${activeProfile.name}${modified ? " *" : ""}` : "Profiles"}
                </span>
                <ChevronDown size={12} aria-hidden="true" />
              </button>
              {activeProfile == null || modified ? (
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={modified ? "Update profile" : "Save profile as"}
                  title={
                    !canSave
                      ? "At least one model must match"
                      : modified
                        ? "Update profile"
                        : "Save profile as…"
                  }
                  disabled={!canSave}
                  onClick={() => (modified ? save(true) : openSave())}
                >
                  <Save size={16} aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </div>
        {storageError || saveError ? (
          <span
            id="global-profile-error"
            className={styles.error}
            role="alert"
            title={storageError || saveError}
          >
            <AlertCircle size={15} aria-hidden="true" />
            <span className={styles.visuallyHidden}>{storageError || saveError}</span>
          </span>
        ) : null}
        <span className={styles.visuallyHidden} role="status">
          {message}
        </span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Additional filters"
          title={
            chips.length
              ? chips.map((chip) => chip.label).join(" / ")
              : "Provider, cost, date and rank"
          }
          aria-expanded={menuOpen && menu === "filters"}
          aria-controls="global-filter-menu"
          popoverTarget="global-filter-menu"
          onClick={(event) => {
            event.preventDefault();
            toggleMenu(event.currentTarget, "filters");
          }}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {chips.length ? <span className={styles.activeDot} /> : null}
        </button>
        {!isDefault ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Reset global filters"
            title="Reset global filters"
            onClick={() => {
              setActiveId("");
              apply(DEFAULT_PROFILE_FILTERS);
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div
        ref={menuRef}
        id="global-filter-menu"
        className={styles.menu}
        popover="auto"
        style={menuPosition}
        onToggle={(event) => setMenuOpen(event.newState === "open")}
      >
        {menu === "profiles" ? (
          <>
            <div className={styles.menuHeading}>
              Profiles <small>This browser</small>
            </div>
            {profiles.map((profile) => (
              <button
                type="button"
                key={profile.id}
                onClick={() => {
                  setActiveId(profile.id);
                  apply(profile.filters);
                  menuRef.current?.hidePopover();
                }}
              >
                {profile.name}
                {profile.id === activeId ? (
                  <Check className={styles.profileCheck} size={14} aria-hidden="true" />
                ) : null}
              </button>
            ))}
            <div className={profiles.length ? styles.menuActions : undefined}>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => {
                  menuRef.current?.hidePopover();
                  openSave();
                }}
              >
                <CopyPlus size={15} aria-hidden="true" />
                Save as new profile
              </button>
              {activeProfile ? (
                <button
                  type="button"
                  disabled={!storageReady}
                  onClick={() => {
                    remove();
                    menuRef.current?.hidePopover();
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Remove profile
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className={styles.menuHeading}>Additional filters</div>
            <div className={styles.filterOptions}>
              <FilterChoices
                label="Reasoning variants"
                options={[false, true]}
                selected={showReasoningVariants === tableVariants ? tableVariants : null}
                format={(value) => (value ? "Expanded" : "Collapsed")}
                onSelect={onShowReasoningVariantsChange}
              />
              <FilterChoices
                label="Max blended cost"
                options={costFilterOptions}
                selected={filters["max-cost"]}
                format={(value) => (value === "all" ? "Any" : `$${value}`)}
                onSelect={(value) => apply({ ...filters, "max-cost": value })}
              />
              <FilterChoices
                label="Release recency"
                options={recencyFilterOptions}
                selected={filters.days}
                format={(value) => (value === "all" ? "All dates" : `${value}d`)}
                onSelect={(value) => apply({ ...filters, days: value })}
              />
              <FilterChoices
                label="Model rank"
                options={modelRankFilterOptions}
                selected={filters.rank}
                format={(value) => (value === "all" ? "All ranks" : `Top ${value}`)}
                onSelect={(value) => apply({ ...filters, rank: value })}
              />
            </div>
            <button type="button" onClick={() => apply({ ...filters, provider: [] })}>
              <Boxes size={16} aria-hidden="true" />
              All providers
              {!filters.provider.length ? <Check size={14} aria-hidden="true" /> : null}
            </button>
            {providerChoices.map((provider) => {
              const logo = providerLogo(provider.slug);
              return (
                <label key={provider.slug}>
                  <input
                    type="checkbox"
                    checked={filters.provider.includes(provider.slug)}
                    onChange={() =>
                      apply({
                        ...filters,
                        provider: filters.provider.includes(provider.slug)
                          ? filters.provider.filter((slug) => slug !== provider.slug)
                          : [...filters.provider, provider.slug],
                      })
                    }
                  />
                  {logo ? (
                    <img className={styles.providerLogo} src={logo} alt="" width={16} height={16} />
                  ) : (
                    <span className={styles.providerLogo} aria-hidden="true">
                      {provider.label.slice(0, 1)}
                    </span>
                  )}
                  <span>{provider.label}</span>
                  <small>{provider.count}</small>
                </label>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

/** Each active global filter as a chip named in the filter menu's terms; removing one keeps every other filter. */
function filterChips(filters: GlobalModelFilters, providerChoices: ProviderOption[]): FilterChip[] {
  const providers = filters.provider.map((slug) => ({
    key: `provider-${slug}`,
    label: providerChoices.find((provider) => provider.slug === slug)?.label ?? slug,
    logo: providerLogo(slug) || undefined,
    remove: { ...filters, provider: filters.provider.filter((other) => other !== slug) },
  }));
  const choices: (FilterChip | null)[] = [
    filters["max-cost"] === "all"
      ? null
      : {
          key: "max-cost",
          label: `Cost ≤ ${fmtMoney(filters["max-cost"])}`,
          remove: { ...filters, "max-cost": "all" },
        },
    filters.days === "all"
      ? null
      : { key: "days", label: `Last ${filters.days} days`, remove: { ...filters, days: "all" } },
    filters.rank === "all"
      ? null
      : { key: "rank", label: `Top ${filters.rank}`, remove: { ...filters, rank: "all" } },
  ];
  return [...providers, ...choices.filter((chip) => chip != null)];
}

/**
 * The strongest collapsed models the current search and filters admit, an exact name or id first.
 * Suggestions read the same filter pipeline as every view, so the list never offers a model the table hides.
 */
function modelSuggestions(
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

/** Keep all preset groups on the same accessible, single-choice button pattern; mixed variant modes have no selected choice. */
function FilterChoices<T extends string | number | boolean>({
  label,
  options,
  selected,
  format,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T | null;
  format: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div>
        {options.map((value) => (
          <button
            key={String(value)}
            type="button"
            className="selection-choice"
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
          >
            {format(value)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
