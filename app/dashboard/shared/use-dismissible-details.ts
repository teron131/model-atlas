/** Checklist dropdowns built on `<details>` (benchmarks, organizations, efforts) close the same way: a press outside closes one, and Escape closes it and returns focus to its summary. */

import { type RefObject, useEffect } from "react";

export function useDismissibleDetails(rootRef: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root?.open && !root.contains(event.target as Node)) root.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (event.key === "Escape" && root?.open) {
        root.open = false;
        root.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [rootRef]);
}
