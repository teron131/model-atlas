"use client";

/** Subscribe controls to their own URL fields while history remains the shared navigation owner. */

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  type DashboardUrlKey,
  type DashboardUrlPatch,
  type DashboardUrlState,
  patchDashboardUrl,
  readUrlValue,
} from "./url-state";

const changeEvent = "model-atlas:url-change";
let editingElement: Element | null = null;
let editingKey: string | null = null;

/** Commit a whole user action once; successive input edits share one history entry until blur or another action. */
export function updateDashboardUrl(patch: DashboardUrlPatch, editing = false) {
  const current = new URL(window.location.href);
  const next = patchDashboardUrl(current, patch);
  const key = Object.keys(patch)[0] ?? "";
  const active = document.activeElement;
  const replace = editing && editingElement === active && editingKey === key;
  if (!replace) {
    resetEditing();
    if (editing) {
      editingElement = active;
      editingKey = key;
      active?.addEventListener("blur", resetEditing, { once: true });
    }
  }
  if (next.href === current.href) return;
  window.history[replace ? "replaceState" : "pushState"](window.history.state, "", next);
  window.dispatchEvent(new Event(changeEvent));
}

/** Select a single serialized field so unrelated table interactions do not invalidate global graph state. */
export function useUrlState<K extends DashboardUrlKey>(key: K, fallback?: DashboardUrlState[K]) {
  const snapshot = useCallback(
    () => JSON.stringify(new URLSearchParams(window.location.search).getAll(key)),
    [key],
  );
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const value = useMemo(() => {
    const values = JSON.parse(raw) as string[];
    if (values.length === 0 && fallback !== undefined) return fallback;
    const params = new URLSearchParams();
    for (const item of values) params.append(key, item);
    return readUrlValue(params, key);
  }, [raw, key, fallback]);
  const setValue = useCallback(
    (next: DashboardUrlState[K]) => {
      updateDashboardUrl(
        { [key]: next },
        key === "q" || key === "table-q" || key === "price-q" || key === "columns",
      );
    },
    [key],
  );
  return [value, setValue] as const;
}

/** Each subscription owns its navigation callback so an unmount cannot remove another control's history reset. */
function subscribe(listener: () => void) {
  const onNavigation = () => {
    resetEditing();
    listener();
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener("popstate", onNavigation);
  window.addEventListener("hashchange", onNavigation);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("popstate", onNavigation);
    window.removeEventListener("hashchange", onNavigation);
  };
}

function serverSnapshot() {
  return "[]";
}
function resetEditing() {
  editingElement?.removeEventListener("blur", resetEditing);
  editingElement = null;
  editingKey = null;
}
