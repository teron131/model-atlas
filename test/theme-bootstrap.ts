/** Verify the saved theme is applied before React hydrates any route. */

import assert from "node:assert/strict";
import vm from "node:vm";

import {
	MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT,
	MODEL_ATLAS_THEME_STORAGE_KEY,
} from "../app/shared/theme-storage";

function bootTheme(savedTheme: string | null): string | undefined {
	const dataset: Record<string, string> = {};
	vm.runInNewContext(MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT, {
		document: { documentElement: { dataset } },
		window: {
			localStorage: {
				getItem(key: string) {
					assert.equal(key, MODEL_ATLAS_THEME_STORAGE_KEY);
					return savedTheme;
				},
			},
		},
	});
	return dataset.modelAtlasTheme;
}

assert.equal(bootTheme("light"), "light");
assert.equal(bootTheme("dark"), "dark");
assert.equal(bootTheme(null), undefined);
assert.equal(bootTheme("system"), undefined);

console.log("theme bootstrap checks passed");
