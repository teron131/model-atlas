"use client";

/** One expandable row owns global model filters and browser profiles; secondary choices float above the page without increasing the row height. */

import {
  AlertCircle,
  Bookmark,
  Boxes,
  Check,
  ChevronDown,
  CopyPlus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import type { ModelAtlasModel } from "../../src/model-atlas/stats/types";
import { fmtMoney } from "./graphs/format";
import {
  DEFAULT_PROFILE_FILTERS,
  matchingProfileModelCount,
  MODEL_PROFILES_STORAGE_KEY,
  type ModelProfile,
  type ModelProfileFilters,
  readModelProfiles,
  removeModelProfile,
  sameProfileFilters,
  saveModelProfile,
} from "./model-profiles";
import {
  costFilterOptions,
  modelRankFilterOptions,
  type ProviderOption,
  recencyFilterOptions,
} from "./shared/model-display";
import { providerLogo } from "./shared/provider-theme";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

import styles from "./global-model-controls.module.css";

/** Validate the current full model group before every create/update, even while the charts are rendering a deferred configuration. */
export function GlobalModelControls({
  filters,
  models,
  fetchedAt,
  providerChoices,
  showReasoningVariants,
  onShowReasoningVariantsChange,
}: {
  filters: ModelProfileFilters;
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
  const matchedCount = useMemo(
    () => matchingProfileModelCount(models, filters, fetchedAt),
    [models, fetchedAt, filters],
  );
  const activeProfile = profiles.find((profile) => profile.id === activeId);
  const isDefault = sameProfileFilters(filters, DEFAULT_PROFILE_FILTERS);
  const modified = activeProfile != null && !sameProfileFilters(activeProfile.filters, filters);
  const canSave = storageReady && matchedCount > 0;
  const activeFilters = [
    filters.provider.length
      ? filters.provider
          .map((slug) => providerChoices.find((p) => p.slug === slug)?.label ?? slug)
          .join(" + ")
      : "",
    filters["max-cost"] !== "all" ? `Cost ≤ ${fmtMoney(filters["max-cost"])}` : "",
    filters.days !== "all" ? `Last ${filters.days} days` : "",
    filters.rank !== "all" ? `Rank ≤ ${filters.rank}` : "",
  ].filter(Boolean);

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

  // A fixed popover must close when its toolbar moves, while its own list remains scrollable.
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
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

  const apply = (next: ModelProfileFilters) => {
    updateDashboardUrl(next);
    setMessage("");
    setSaveError("");
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

  const selectionLabel = activeProfile
    ? `${activeProfile.name}${modified ? " *" : ""}`
    : filters.q.trim() || "All models";
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
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label="Global filters"
        aria-controls="global-model-filters"
        aria-expanded={open}
        onClick={() => {
          menuRef.current?.hidePopover();
          setOpen(!open);
        }}
      >
        <span>Filters</span>
        <b>{!open ? selectionLabel : ""}</b>
        <i aria-hidden="true">{open ? "−" : "+"}</i>
      </button>
      <div id="global-model-filters" className={styles.panel} hidden={!open}>
        <div className={styles.row} role="group" aria-label="Global model filters">
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Global model search"
              placeholder="Search models…"
              title="Use * as a wildcard; separate alternatives with commas."
              autoComplete="off"
              spellCheck={false}
              value={filters.q}
              onChange={(event) => {
                updateDashboardUrl({ q: event.target.value }, true);
                setMessage("");
                setSaveError("");
              }}
            />
            <output
              aria-live="polite"
              aria-label={`${matchedCount} matching models`}
              title={`${matchedCount} matching models`}
            >
              {matchedCount}
            </output>
          </label>
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
              activeFilters.length ? activeFilters.join(" / ") : "Provider, cost, date and rank"
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
                apply(DEFAULT_PROFILE_FILTERS);
              }}
            >
              <RotateCcw size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
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
