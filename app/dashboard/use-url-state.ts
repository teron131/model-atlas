"use client";

/** Subscribe controls to their own URL fields while history remains the shared navigation owner. */

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  type DashboardUrlKey,
  type DashboardUrlPatch,
  type DashboardUrlState,
  patchDashboardUrl,
  readUrlValue,
} from "./url-state";

const changeEvent = "model-atlas:url-change";
const InitialSearch = createContext("");
let editingElement: Element | null = null;
let editingKey: string | null = null;

/** Seed server rendering and hydration with the request's selections before browser history takes over. */
export function DashboardUrlProvider({
  search,
  children,
}: {
  search: string;
  children: ReactNode;
}) {
  return createElement(InitialSearch.Provider, { value: search }, children);
}

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
  const initialSearch = useContext(InitialSearch);
  const serverSnapshot = useCallback(
    () => JSON.stringify(new URLSearchParams(initialSearch).getAll(key)),
    [initialSearch, key],
  );
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
      updateDashboardUrl({ [key]: next }, key === "q" || key === "table-q" || key === "columns");
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

function resetEditing() {
  editingElement?.removeEventListener("blur", resetEditing);
  editingElement = null;
  editingKey = null;
}
