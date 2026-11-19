"use client";

/**
 * The dashboard's controls read one store of URL-backed state, and every change writes the address it is shown at.
 * The address carries one section's controls and the page-wide ones, while each history entry saves the whole state, so Back, Forward, and a reload restore every section's controls and a copied link holds only what it points at.
 */

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  dashboardHistoryEntry,
  type DashboardSection,
  type DashboardState,
  dashboardUrl,
  type DashboardUrlKey,
  type DashboardUrlPatch,
  type DashboardUrlState,
  patchDashboardState,
  readDashboardUrl,
  readUrlValue,
  savedDashboardState,
} from "./url-state";

const changeEvent = "model-atlas:url-change";
const InitialSearch = createContext("");
let state: DashboardState | null = null;
let editingElement: Element | null = null;
let editingKey: string | null = null;

/** Seed server rendering and hydration with the request's state before the history entry's takes over; `url` is the request's path and query. */
export function DashboardUrlProvider({ url, children }: { url: string; children: ReactNode }) {
  const search = readDashboardUrl(new URL(url, "http://dashboard.local")).params.toString();
  useEffect(() => {
    commit(currentState(), "replace");
  }, []);
  return createElement(InitialSearch.Provider, { value: search }, children);
}

/** Commit a whole user action once; successive input edits share one history entry until blur or another action. */
export function updateDashboardUrl(patch: DashboardUrlPatch, editing = false) {
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
  commit(patchDashboardState(currentState(), patch), replace ? "replace" : "push");
}

/** Rewrite the current history entry for a follow-up choice inside an open view, such as switching the model sheet's model, so Back still leaves the view in one step. */
export function replaceDashboardUrl(patch: DashboardUrlPatch) {
  resetEditing();
  commit(patchDashboardState(currentState(), patch), "replace");
}

/** Move the address to `section`, as following a link to it would, with one history entry. */
export function showDashboardSection(section: DashboardSection) {
  resetEditing();
  commit({ ...currentState(), section }, "push");
}

/** The link to `section` with the controls it owns as they are now, whichever section the address shows. */
export function dashboardSectionLink(section: DashboardSection): string {
  return dashboardUrl({ ...currentState(), section }, new URL(window.location.href)).href;
}

/** Select a single serialized field so unrelated table interactions do not invalidate global graph state. */
export function useUrlState<K extends DashboardUrlKey>(key: K, fallback?: DashboardUrlState[K]) {
  const initialSearch = useContext(InitialSearch);
  const serverSnapshot = useCallback(
    () => JSON.stringify(new URLSearchParams(initialSearch).getAll(key)),
    [initialSearch, key],
  );
  const snapshot = useCallback(() => JSON.stringify(currentState().params.getAll(key)), [key]);
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
      updateDashboardUrl({ [key]: next }, key === "q" || key === "table-q");
    },
    [key],
  );
  return [value, setValue] as const;
}

// The page opens on the state its history entry saved, as after a reload, or else on its address's.
function currentState(): DashboardState {
  if (state == null) {
    state =
      savedDashboardState(window.history.state) ?? readDashboardUrl(new URL(window.location.href));
    window.addEventListener("popstate", (event) => {
      resetEditing();
      state = savedDashboardState(event.state) ?? readDashboardUrl(new URL(window.location.href));
      window.dispatchEvent(new Event(changeEvent));
    });
  }
  return state;
}

// The history entry keeps the router's own fields beside the dashboard's; an action that changes nothing adds no entry.
function commit(next: DashboardState, mode: "push" | "replace") {
  const held = currentState();
  if (
    mode === "push" &&
    next.section === held.section &&
    next.params.toString() === held.params.toString()
  )
    return;
  state = next;
  const entry = { ...window.history.state, dashboard: dashboardHistoryEntry(next) };
  const url = dashboardUrl(next, new URL(window.location.href));
  if (mode === "push") window.history.pushState(entry, "", url);
  else window.history.replaceState(entry, "", url);
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

function resetEditing() {
  editingElement?.removeEventListener("blur", resetEditing);
  editingElement = null;
  editingKey = null;
}
