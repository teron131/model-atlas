"use client";

/** Inject the trusted theme bootstrap into server HTML without reconciling an executable script on the client. */

import { useServerInsertedHTML } from "next/navigation";

import { MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT } from "./theme-storage";

export function ThemeBootstrap() {
	useServerInsertedHTML(() => (
		<script id="model-atlas-theme">{MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT}</script>
	));
	return null;
}
