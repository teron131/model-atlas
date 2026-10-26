/** Screenshot actions for dashboard surfaces: a graph region or a model sheet captured in place, or an export-only surface such as the leaderboard's. */

"use client";

import type { RefObject } from "react";

import { ScreenshotIcon } from "../shared/DashboardIcons";
import { captureFileToken } from "./png";
import { type CaptureState, usePngCapture } from "./use-png";

/** Download a referenced surface while keeping the action itself out of the image; `kind` names the surface in the button's label, and `onStaged` lets the surface redraw its staged copy for the image's width. */
export function CaptureButton({
  targetRef,
  title,
  captureWidth,
  fileName,
  kind = "graph",
  onStaged,
}: {
  targetRef: RefObject<HTMLElement | null>;
  title: string;
  captureWidth: number;
  fileName?: string;
  kind?: string;
  onStaged?: (staged: HTMLElement) => void;
}) {
  const { capture, state } = usePngCapture(
    targetRef,
    fileName ?? `model-atlas-${captureFileToken(title)}`,
    captureWidth,
    onStaged,
  );
  return (
    <CaptureAction subject={`${title} ${kind}`} state={state} onCapture={() => void capture()} />
  );
}

/** The screenshot button every capture shares; `preparing` covers mounting an export-only surface before it can render. */
export function CaptureAction({
  subject,
  state,
  preparing = false,
  disabled = false,
  onCapture,
}: {
  subject: string;
  state: CaptureState;
  preparing?: boolean;
  disabled?: boolean;
  onCapture: () => void;
}) {
  const busy = preparing || state === "rendering";
  const label =
    preparing && state === "idle"
      ? `Preparing ${subject} PNG`
      : state === "rendering"
        ? `Rendering ${subject} PNG`
        : state === "saved"
          ? `${capitalized(subject)} PNG saved`
          : state === "error"
            ? `${capitalized(subject)} PNG failed`
            : `Download ${subject} PNG`;
  return (
    <button
      className="dashboard-action-button"
      type="button"
      aria-label={label}
      aria-busy={busy}
      data-state={state}
      data-capture-exclude
      disabled={disabled || busy}
      title={label}
      onClick={onCapture}
    >
      <ScreenshotIcon />
    </button>
  );
}

function capitalized(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
