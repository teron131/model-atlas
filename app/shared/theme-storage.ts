/** Persisted theme contract and pre-hydration bootstrap for every Model Atlas route. */

export const MODEL_ATLAS_THEME_STORAGE_KEY = "model-atlas:dashboard-theme";

export const MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT = `
try {
	const theme = window.localStorage.getItem("${MODEL_ATLAS_THEME_STORAGE_KEY}");
	if (theme === "light" || theme === "dark") {
		document.documentElement.dataset.modelAtlasTheme = theme;
	}
} catch {}
`;
