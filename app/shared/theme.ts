"use client";

/** Shared root-theme controls and cross-tab synchronization for Model Atlas pages. */

import { useEffect } from "react";

import { MODEL_ATLAS_THEME_STORAGE_KEY } from "./theme-storage";

export type ModelAtlasTheme = "dark" | "light";

/** Read the theme the pre-paint bootstrap installed, defaulting to the dark root palette. */
export function currentModelAtlasTheme(): ModelAtlasTheme {
  return document.documentElement.dataset.modelAtlasTheme === "light" ? "light" : "dark";
}

/** Keep an open page synchronized when another tab changes the saved theme. */
export function useThemeSynchronization() {
  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (
        event.key === MODEL_ATLAS_THEME_STORAGE_KEY &&
        (event.newValue === "light" || event.newValue === "dark")
      ) {
        applyModelAtlasTheme(event.newValue);
      }
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);
}

/** Toggle the root theme immediately so React route transitions cannot flash dark. */
export function toggleModelAtlasTheme(): void {
  applyModelAtlasTheme(currentModelAtlasTheme() === "dark" ? "light" : "dark");
}

/**
 * Write the theme and persist it.
 * Exported so the signature can keep its material mode and the page field in step; the root attribute is the single source of truth every listener observes.
 */
export function applyModelAtlasTheme(theme: ModelAtlasTheme): void {
  document.documentElement.dataset.modelAtlasTheme = theme;
  try {
    window.localStorage.setItem(MODEL_ATLAS_THEME_STORAGE_KEY, theme);
  } catch {}
}
