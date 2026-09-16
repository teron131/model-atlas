"use client";

/** Inject the saved theme into server HTML before paint so every route opens without a palette flash. */

import { useServerInsertedHTML } from "next/navigation";

import { MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT } from "./theme-storage";

export function ThemeBootstrap() {
  useServerInsertedHTML(() => (
    <script id="model-atlas-theme">{MODEL_ATLAS_THEME_BOOTSTRAP_SCRIPT}</script>
  ));
  return null;
}
