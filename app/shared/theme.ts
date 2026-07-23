"use client";

/** Shared root-theme controls and cross-tab synchronization for Model Atlas pages. */

import { useEffect } from "react";

import { MODEL_ATLAS_THEME_STORAGE_KEY } from "./theme-storage";

type ModelAtlasTheme = "dark" | "light";

/** Keep an open page synchronized when another tab changes the saved theme. */
export function useModelAtlasThemeSynchronization() {
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

/** Toggle the root theme immediately so React route transitions cannot flash dark. */
export function toggleModelAtlasTheme(): void {
	const current =
		document.documentElement.dataset.modelAtlasTheme === "light"
			? "light"
			: "dark";
	applyTheme(current === "dark" ? "light" : "dark");
}

function applyTheme(theme: ModelAtlasTheme): void {
	document.documentElement.dataset.modelAtlasTheme = theme;
	try {
		window.localStorage.setItem(MODEL_ATLAS_THEME_STORAGE_KEY, theme);
	} catch {}
}
