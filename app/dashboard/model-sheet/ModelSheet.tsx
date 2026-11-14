"use client";

/** The model sheet: one model's complete catalogue entry, opened from any leaderboard row, chart star, or frontier role and shared by URL; a pinned model sits beside it with every row aligned for comparison. */

import { Columns2, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import type { ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { CaptureButton } from "../capture/CaptureButton";
import { ARTIFACT_WIDTH, WIDE_ARTIFACT_WIDTH } from "../capture/png";
import { CopyDashboardLink } from "../CopyDashboardLink";
import { redrawPlotsForCapture } from "../graphs/use-chart-layout";
import { providerDisplayName } from "../shared/provider-theme";
import { ProviderLogo } from "../shared/ProviderLogo";
import { useUrlState } from "../use-url-state";
import { ChangeHistory, MODEL_SHEET_CHANGES_ID } from "./ChangeHistory";
import { CompareSearch } from "./CompareSearch";
import { entryEffort, familyName, type SheetEntry, useSheetEntries } from "./entries";
import { FrontierInset } from "./FrontierInset";
import {
  closeModelSheet,
  dismissModelSheet,
  MODEL_SHEET_CHANGES_REQUESTED,
  modelSheetOpenedSince,
  pinModelSheet,
  takeModelSheetChangesRequest,
  unpinModelSheet,
} from "./open";
import { ReasoningEffort } from "./ReasoningEffort";
import { BenchmarkEvidence, Facts, Resources, Scores } from "./Sections";

import styles from "./model-sheet.module.css";

// How far the evidence scrolls before a phone's head folds to one line.
const HEAD_FOLD_SCROLL = 8;

/**
 * Render the sheet named by the URL over the dashboard, measuring each model against the same display population as the leaderboard: collapsed models for a model, every reasoning variant for a variant.
 *
 * The sheet is non-modal, so another row or star can switch it in place.
 * Opening from elsewhere moves focus to its heading; closing returns focus to whatever opened it.
 * A pinned model takes the left column and the opened model the right, so choosing other models keeps comparing against the pin.
 */
export function ModelSheet({ payload }: { payload: ModelAtlasPayload | null }) {
  const [modelKey] = useUrlState("model");
  const [effort] = useUrlState("effort");
  const [compareKey] = useUrlState("compare");
  const [compareEffort] = useUrlState("compare-effort");
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = modelKey != null && payload != null;
  const { opened, pinned } = useSheetEntries(payload, modelKey, effort, compareKey, compareEffort);
  const target = modelKey == null ? null : `${modelKey}\u0000${effort ?? ""}`;
  const found = opened != null;

  // A model chosen outside the sheet takes focus into it and remembers the opener; choices inside the sheet keep their own focus.
  useLayoutEffect(() => {
    if (target == null || !found) return;
    sheetRef.current?.scrollTo({ top: 0 });
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheetRef.current?.contains(active)) return;
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    headingRef.current?.focus({ preventScroll: true });
  }, [target, found]);

  // A Change cell's jump follows the scroll to the top above.
  useLayoutEffect(() => {
    if (!found) return;
    let release = () => {};
    let frame = 0;
    const jump = () => {
      release();
      if (sheetRef.current) release = holdChangesInView(sheetRef.current);
    };
    if (takeModelSheetChangesRequest()) jump();
    // A request for the model already shown changes no URL, so it arrives as an event; waiting a frame lets a request that switches models reach this effect first.
    const request = () => {
      frame = requestAnimationFrame(() => {
        if (takeModelSheetChangesRequest()) jump();
      });
    };
    window.addEventListener(MODEL_SHEET_CHANGES_REQUESTED, request);
    return () => {
      window.removeEventListener(MODEL_SHEET_CHANGES_REQUESTED, request);
      cancelAnimationFrame(frame);
      release();
    };
  }, [target, found]);

  // Closing by button, Escape, or Back unmounts the sheet; focus then returns to its opener.
  useLayoutEffect(() => {
    if (open) return;
    const opener = returnFocusRef.current;
    returnFocusRef.current = null;
    const active = document.activeElement;
    if (opener?.isConnected && (active == null || active === document.body)) {
      opener.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const typing =
        event.target instanceof HTMLElement &&
        event.target.matches("input, textarea, select") &&
        !sheetRef.current?.contains(event.target);
      if (typing || document.querySelector(":popover-open") != null) return;
      closeModelSheet();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  // A click elsewhere on the page hides the sheet but keeps a pinned model; Escape and the close button let it go.
  useEffect(() => {
    if (!open) return;
    const dismissOnClickElsewhere = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || sheetRef.current?.contains(event.target)) return;
      // Openers act anywhere along the click's path, the sky's on the window itself, so decide once the click has finished.
      window.setTimeout(() => {
        if (!modelSheetOpenedSince(event.timeStamp)) dismissModelSheet();
      });
    };
    document.addEventListener("click", dismissOnClickElsewhere);
    return () => document.removeEventListener("click", dismissOnClickElsewhere);
  }, [open]);

  if (!open) return null;
  if (opened == null) {
    return (
      <aside
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="false"
        aria-labelledby="model-sheet-title"
      >
        <header className={styles.head}>
          <div className={styles.headEntry}>
            <h2 id="model-sheet-title" ref={headingRef} tabIndex={-1} className={styles.name}>
              Model not found
            </h2>
            <div className={styles.actions}>
              <CloseButton />
            </div>
          </div>
        </header>
        <p className={styles.notice}>
          {modelKey}
          {effort == null ? "" : ` (${effort})`} is not in the current snapshot.
        </p>
      </aside>
    );
  }

  // A pin naming the opened model itself waits for another model before the sheet splits.
  const comparing = pinned != null && pinned.row !== opened.row;
  const entries = comparing ? [pinned, opened] : [opened];
  const captureTitle = entries.map(familyName).join(" vs ");
  // The image is a wide card for sharing, laid out in columns rather than the panel's single tall column.
  const capture = (
    <CaptureButton
      targetRef={sheetRef}
      title={captureTitle}
      kind="sheet"
      captureWidth={comparing ? WIDE_ARTIFACT_WIDTH : ARTIFACT_WIDTH}
      onStaged={(card, sheet) => {
        clearCopiedLabelColumn(card);
        redrawPlotsForCapture(card, sheet);
      }}
    />
  );
  return (
    <aside
      ref={sheetRef}
      className={styles.sheet}
      data-compare={comparing || undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={
        comparing ? "model-sheet-pinned-title model-sheet-title" : "model-sheet-title"
      }
      style={{ "--sheet-entries": entries.length } as CSSProperties}
      onScroll={(event) => {
        if (headRef.current != null) foldHead(headRef.current, event.currentTarget.scrollTop);
      }}
    >
      <header ref={headRef} className={styles.head}>
        {comparing ? (
          <>
            {/* The Compare toggle holds the label column, which stays in the image without it; the other actions keep the single sheet's top-right corner, so each name keeps its column's full width. */}
            <div className={styles.compareControls}>
              <CompareToggle entry={opened} comparing />
            </div>
            <SheetIdentity entry={pinned} titleId="model-sheet-pinned-title" />
            <SheetIdentity entry={opened} titleId="model-sheet-title" headingRef={headingRef} />
            <div className={`${styles.actions} ${styles.compareActions}`} data-capture-exclude>
              {capture}
              <CopyDashboardLink />
              <CloseButton />
            </div>
          </>
        ) : (
          <SheetIdentity
            entry={opened}
            titleId="model-sheet-title"
            headingRef={headingRef}
            actions={
              <>
                <CompareToggle entry={opened} comparing={compareKey != null} />
                {capture}
                <CopyDashboardLink />
                <CloseButton />
              </>
            }
          />
        )}
        {/* The waiting comparison stays in the sticky head, so its search reads wherever the sheet is scrolled. */}
        {compareKey != null && !comparing ? (
          pinned == null ? (
            <p className={styles.pinNote} role="status" data-capture-exclude>
              {compareKey} is set to compare but is not in the current snapshot.
            </p>
          ) : (
            <CompareSearch pinned={pinned} models={payload.models} />
          )
        ) : null}
      </header>

      <div className={styles.body}>
        <Facts entries={entries} />
        <Scores entries={entries} />
        <Resources entries={entries} />
        <FrontierInset population={opened.rows} entries={entries} />
        {entries.some((entry) => entry.variants.length > 1) ? (
          <ReasoningEffort entries={entries} />
        ) : null}
        <BenchmarkEvidence entries={entries} />
        {!comparing && opened.row.model.latest_change ? (
          <ChangeHistory
            change={opened.row.model.latest_change}
            effort={entryEffort(opened)}
            key={`${opened.row.model.id}\u0000${entryEffort(opened)}`}
            model={opened.row.model}
          />
        ) : null}
      </div>
    </aside>
  );
}

/** Staging copies the sheet's resolved custom properties onto the card, a phone's narrower label column among them; the card drops that column to take its own, so a phone-saved image keeps a desktop one's labels whole. */
function clearCopiedLabelColumn(card: HTMLElement) {
  card.style.removeProperty("--sheet-label");
  card.style.removeProperty("--sheet-columns");
}

/** Marks the head folded once the evidence scrolls; the height a phone's folded head gives up stays as its margin, so the evidence never jumps as it folds or unfolds. */
function foldHead(head: HTMLElement, scrollTop: number) {
  const folded = scrollTop > HEAD_FOLD_SCROLL;
  if (folded === head.hasAttribute("data-folded")) return;
  if (!folded) {
    head.removeAttribute("data-folded");
    head.style.removeProperty("--head-fold");
    return;
  }
  const open = head.offsetHeight;
  head.setAttribute("data-folded", "");
  head.style.setProperty("--head-fold", `${open - head.offsetHeight}px`);
}

function SheetIdentity({
  entry,
  titleId,
  headingRef,
  actions,
}: {
  entry: SheetEntry;
  titleId: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  actions?: ReactNode;
}) {
  const model = entry.row.model;
  const view =
    entry.effort != null
      ? ` · ${entry.effort} effort`
      : entry.variants.length > 1
        ? " · Collapsed"
        : "";
  return (
    <div className={styles.headEntry}>
      <div className={styles.identity}>
        <ProviderLogo model={model} />
        <div>
          <p className={styles.kicker}>
            {providerDisplayName(model)}
            {view}
          </p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.name}>
            {familyName(entry)}
          </h2>
          {model.id ? <p className={styles.slug}>{model.id}</p> : null}
        </div>
      </div>
      {actions == null ? null : (
        <div className={styles.actions} data-capture-exclude>
          {actions}
        </div>
      )}
    </div>
  );
}

function CompareToggle({ entry, comparing }: { entry: SheetEntry; comparing: boolean }) {
  const key = entry.row.model.id ?? entry.row.model.name;
  if (key == null) return null;
  return (
    <button
      type="button"
      className={`selection-choice ${styles.compareToggle}`}
      data-compare-toggle
      data-capture-exclude
      aria-pressed={comparing}
      title={comparing ? "Stop comparing" : "Keep this model here and open another to compare"}
      onClick={() => (comparing ? unpinModelSheet() : pinModelSheet(key, entry.effort))}
    >
      <Columns2 aria-hidden="true" />
      Compare
    </button>
  );
}

function CloseButton() {
  return (
    <button
      type="button"
      className="dashboard-action-button"
      aria-label="Close model sheet"
      title="Close"
      onClick={closeModelSheet}
    >
      <X aria-hidden="true" />
    </button>
  );
}

// The body's top padding, so a section jumped to sits below the pinned identity where the first section does.
const SECTION_CLEARANCE_PX = 18;

// Input by which the reader takes over the sheet's scrolling from a jump.
const READER_INPUTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/**
 * Bring the Changes heading just below the pinned identity, as a link to a page heading would, and keep it there until the reader takes over; returns the hold's release.
 * A browser holds a page's linked heading the same way while the page settles: here the sheet's plots measure themselves after it opens, which moves the heading.
 */
function holdChangesInView(sheet: HTMLElement): () => void {
  const heading = sheet.querySelector(`#${MODEL_SHEET_CHANGES_ID}`);
  const head = sheet.querySelector("header");
  const body = heading?.closest(`.${styles.body}`);
  // A comparison has no Changes section.
  if (heading == null || head == null || body == null) return () => {};
  const place = () =>
    sheet.scrollTo({
      top:
        sheet.scrollTop +
        heading.getBoundingClientRect().top -
        sheet.getBoundingClientRect().top -
        head.offsetHeight -
        SECTION_CLEARANCE_PX,
    });
  const hold = new ResizeObserver(place);
  const release = () => {
    hold.disconnect();
    for (const type of READER_INPUTS) sheet.removeEventListener(type, release);
  };
  place();
  hold.observe(body);
  for (const type of READER_INPUTS) sheet.addEventListener(type, release, { passive: true });
  return release;
}
