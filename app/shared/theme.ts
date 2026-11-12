"use client";

/** Shared root-theme controls and cross-tab synchronization for Model Atlas pages. */

import { useEffect, useSyncExternalStore } from "react";

import { MODEL_ATLAS_THEME_STORAGE_KEY } from "./theme-storage";

type ModelAtlasTheme = "dark" | "light";

/** Keep an open page synchronized when another tab changes the saved theme. */
export function useThemeSynchronization() {
  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (
        event.key === MODEL_ATLAS_THEME_STORAGE_KEY &&
        (event.newValue === "light" || event.newValue === "dark")
      ) {
        applyTheme(event.newValue);
      }
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);
}

/** Toggle the root theme immediately so route transitions retain the chosen palette. */
export function toggleModelAtlasTheme(): void {
  applyTheme(readTheme() === "dark" ? "light" : "dark");
}

/** The root theme, following every change to it; the server renders the dark default. */
export function useModelAtlasTheme(): ModelAtlasTheme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "dark");
}

function readTheme(): ModelAtlasTheme {
  return document.documentElement.dataset.modelAtlasTheme === "light" ? "light" : "dark";
}

function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-model-atlas-theme"],
  });
  return () => observer.disconnect();
}

function applyTheme(theme: ModelAtlasTheme): void {
  document.documentElement.dataset.modelAtlasTheme = theme;
  try {
    window.localStorage.setItem(MODEL_ATLAS_THEME_STORAGE_KEY, theme);
  } catch {}
}
