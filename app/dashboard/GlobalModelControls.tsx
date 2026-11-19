"use client";

/** The rail always shows the global model search, which suggests matching models to open directly; active filters, profiles, and additional filters sit beside it on wide screens and fold behind a toggle on phones, while secondary choices float above the page. */

import {
  AlertCircle,
  Bookmark,
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
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";

import type { ModelAtlasModel } from "../../src/model-atlas/stats/types";
import { matchingProfileModelCount, sameProfileFilters, useModelProfiles } from "./model-profiles";
import { openModelSheet } from "./model-sheet/open";
import { regionElement } from "./research-index";
import { Checklist } from "./shared/Checklist";
import {
  costFilterOptions,
  type GlobalModelFilters,
  modelRankFilterOptions,
  type ProviderOption,
  recencyFilterOptions,
} from "./shared/model-filters";
import {
  ModelSuggestionList,
  modelSuggestionRow,
  modelSuggestions,
  useModelSuggestions,
} from "./shared/ModelSuggestions";
import { providerLogo } from "./shared/provider-theme";
import { DEFAULT_GLOBAL_MODEL_FILTERS } from "./url-state";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

import styles from "./global-model-controls.module.css";

const MODEL_SEARCH_ID = "global-model-search";
const MODEL_SUGGESTIONS_ID = "global-model-suggestions";
// Wide enough for the filter tracks' stop labels, such as "$0.02", to stand apart at the 12px label size.
const MENU_WIDTH = 380;
const MENU_GUTTER = 8;
// A pinned rail keeps its search this close to the viewport top; anywhere lower, the rail has not reached the top yet.
const PINNED_SEARCH_TOP = 64;

/**
 * Focus the rail's model search from anywhere, selecting any current query so typing replaces it.
 * Until the rail is pinned, as in the hero, the leaderboard scrolls up beneath it first, so results are in view while typing.
 */
function focusModelSearch() {
  const input = document.getElementById(MODEL_SEARCH_ID);
  if (!(input instanceof HTMLInputElement)) return;
  if (input.getBoundingClientRect().top > PINNED_SEARCH_TOP) {
    regionElement("leaderboard")?.scrollIntoView({ block: "start" });
  }
  input.focus({ preventScroll: true });
  input.select();
}

/** "/" reaches the model search from anywhere except while typing in another field. */
function useModelSearchShortcut() {
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
}

/** Takes the live filters and the full model list, not the charts' deferred copies, so a profile save is checked against the configuration it stores. */
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
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({ left: 0, top: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menu, setMenu] = useState<"profiles" | "filters">("profiles");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const matchedCount = useMemo(
    () => matchingProfileModelCount(models, filters, fetchedAt),
    [models, fetchedAt, filters],
  );
  const suggestions = useMemo(
    () => modelSuggestions(models, filters, fetchedAt),
    [models, fetchedAt, filters],
  );
  // A suggestion opens its collapsed model's sheet and leaves the search, and so the filtered views, as typed.
  const suggestion = useModelSuggestions(MODEL_SUGGESTIONS_ID, suggestions, (model) =>
    openModelSheet({ ...model, reasoning_effort: null }),
  );
  const {
    profiles,
    activeProfile,
    modified,
    setActiveId,
    storageReady,
    storageError,
    saveError,
    message,
    canSave,
    clearFeedback,
    save,
    remove,
  } = useModelProfiles(filters, matchedCount);
  const isDefault = sameProfileFilters(filters, DEFAULT_GLOBAL_MODEL_FILTERS);
  const activeFilters = activeFilterLabels(filters, providerChoices);
  useModelSearchShortcut();

  useEffect(() => {
    if (saveOpen) nameRef.current?.focus();
  }, [saveOpen]);

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
    clearFeedback();
  };

  const saveProfile = (updating: boolean) => {
    if (save(updating, name)) {
      setSaveOpen(false);
      setName("");
    }
  };

  const removeProfile = () => {
    if (remove()) setSaveOpen(false);
  };

  const openSave = () => {
    setSaveOpen(true);
    clearFeedback();
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
    // The menu runs to the viewport's edge on the side it opens, so the provider list shows as many rows as the window allows.
    const maxHeight = Math.max(0, opensAbove ? above : below);
    const width = Math.min(MENU_WIDTH, window.innerWidth - MENU_GUTTER * 2);
    setMenuPosition({
      width,
      left: Math.max(
        MENU_GUTTER,
        Math.min(box.right - width, window.innerWidth - width - MENU_GUTTER),
      ),
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
          {/* Typing filters every view and also lists the strongest matches; arrows choose one and Enter opens its sheet, the first match when none is chosen. */}
          <input
            id={MODEL_SEARCH_ID}
            type="search"
            aria-label="Filter models"
            aria-keyshortcuts="/"
            placeholder="Filter models …"
            title="Use * as a wildcard; separate alternatives with commas. Press / to filter from anywhere."
            {...suggestion.inputProps}
            value={filters.q}
            onChange={(event) => {
              updateDashboardUrl({ q: event.target.value }, true);
              suggestion.show();
              clearFeedback();
            }}
          />
          {/* The count stays mounted as a live region; while no filter applies, the "/" keycap takes its place on screen. */}
          <output
            className={isDefault ? "visually-hidden" : undefined}
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
        {suggestion.listOpen ? (
          <ModelSuggestionList {...suggestion.listProps} describe={modelSuggestionRow} />
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
        {activeProfile != null || activeFilters.length ? (
          <span className={styles.activeDot} />
        ) : null}
      </button>
      <div
        id="global-model-filters"
        className={styles.panel}
        data-open={open}
        role="group"
        aria-label="Profiles and filters"
      >
        <div className={styles.profiles}>
          {saveOpen ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveProfile(false);
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
                  onClick={() => (modified ? saveProfile(true) : openSave())}
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
            <span className="visually-hidden">{storageError || saveError}</span>
          </span>
        ) : null}
        <span className="visually-hidden" role="status">
          {message}
        </span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Additional filters"
          title={activeFilters.length ? activeFilters.join(" / ") : "Provider, cost, date and rank"}
          aria-expanded={menuOpen && menu === "filters"}
          aria-controls="global-filter-menu"
          popoverTarget="global-filter-menu"
          onClick={(event) => {
            event.preventDefault();
            toggleMenu(event.currentTarget, "filters");
          }}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {activeFilters.length ? <span className={styles.activeDot} /> : null}
        </button>
        {!isDefault ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Reset global filters"
            title="Reset global filters"
            onClick={() => {
              setActiveId("");
              apply(DEFAULT_GLOBAL_MODEL_FILTERS);
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
                {profile.id === activeProfile?.id ? (
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
                    removeProfile();
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
            <div className={styles.filterOptions}>
              <FilterChoices
                label="Reasoning variants"
                options={[false, true]}
                selected={showReasoningVariants === tableVariants ? tableVariants : null}
                format={(value) => (value ? "Expanded" : "Collapsed")}
                onSelect={onShowReasoningVariantsChange}
              />
              <FilterTrack
                label="Max blended cost ($)"
                options={costFilterOptions}
                selected={filters["max-cost"]}
                format={(value) => (value === "all" ? "Any" : value.toFixed(2))}
                onSelect={(value) => apply({ ...filters, "max-cost": value })}
              />
              <FilterTrack
                label="Release recency (days)"
                options={recencyFilterOptions}
                selected={filters.days}
                format={(value) => (value === "all" ? "All" : String(value))}
                onSelect={(value) => apply({ ...filters, days: value })}
              />
              <FilterTrack
                label="Model rank (top)"
                options={modelRankFilterOptions}
                selected={filters.rank}
                format={(value) => (value === "all" ? "All" : String(value))}
                onSelect={(value) => apply({ ...filters, rank: value })}
              />
            </div>
            <div className={styles.providers}>
              <Checklist
                items={providerChoices}
                itemKey={(provider) => provider.slug}
                name={{
                  label: "Provider",
                  sort: "ascending",
                  text: (provider) => provider.label,
                  logo: (provider) => providerLogo(provider.slug),
                }}
                columns={[
                  {
                    key: "models",
                    label: "#Models",
                    sort: "descending",
                    value: (provider) => provider.count,
                    text: (provider) => String(provider.count),
                  },
                ]}
                initialSort={{ key: "models", direction: "descending" }}
                search={{ label: "Search providers", placeholder: "Search providers" }}
                all={{
                  label: "All providers",
                  checked: !filters.provider.length,
                  onSelect: () => apply({ ...filters, provider: [] }),
                }}
                empty="No matching providers"
                checked={(provider) => filters.provider.includes(provider.slug)}
                onToggle={(provider) =>
                  apply({
                    ...filters,
                    provider: filters.provider.includes(provider.slug)
                      ? filters.provider.filter((slug) => slug !== provider.slug)
                      : [...filters.provider, provider.slug],
                  })
                }
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function activeFilterLabels(filters: GlobalModelFilters, providerChoices: ProviderOption[]) {
  const providers = filters.provider.map(
    (slug) => providerChoices.find((provider) => provider.slug === slug)?.label ?? slug,
  );
  const cost = filters["max-cost"];
  const { days, rank } = filters;
  return [
    ...providers,
    ...(cost === "all" ? [] : [`Cost ≤ $${cost.toFixed(2)}`]),
    ...(days === "all" ? [] : [days === 365 ? "1y" : `${days}d`]),
    ...(rank === "all" ? [] : [`Top ${rank}`]),
  ];
}

/**
 * A threshold filter as a stepped track: one stop per option, strictest first, lit from the start up to the chosen stop.
 * A native range input takes pointer, touch, and arrow-key input and snaps to the stops; each stop's label also picks it.
 */
function FilterTrack<T extends number | "all">({
  label,
  options,
  selected,
  format,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  format: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  const id = useId();
  const chosen = options.indexOf(selected);
  const at = (index: number) => ({ "--stop": index / (options.length - 1) }) as CSSProperties;
  return (
    <div
      className={styles.track}
      style={{ "--reach": chosen / (options.length - 1) } as CSSProperties}
    >
      <label htmlFor={id}>{label}</label>
      <div className={styles.trackRail}>
        <input
          id={id}
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={chosen}
          aria-valuetext={format(selected)}
          onChange={(event) => onSelect(options[Number(event.target.value)]!)}
        />
        {options.map((value, index) => (
          <span
            key={String(value)}
            className={styles.trackStop}
            style={at(index)}
            data-reached={index <= chosen || undefined}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className={styles.trackLabels} aria-hidden="true">
        {options.map((value, index) => (
          <span
            key={String(value)}
            style={at(index)}
            data-chosen={index === chosen || undefined}
            onClick={() => onSelect(value)}
          >
            {format(value)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A `null` selection marks no choice, as when the charts and the leaderboard show different variant modes. */
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
