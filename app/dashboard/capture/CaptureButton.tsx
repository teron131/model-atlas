/** Direct screenshot action for a dashboard surface: a graph panel or a model sheet. */

"use client";

import type { RefObject } from "react";

import { ScreenshotIcon } from "../shared/DashboardIcons";
import { captureFileToken } from "./png";
import { usePngCapture } from "./use-png";

import styles from "./capture.module.css";

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
  const label =
    state === "rendering"
      ? `Rendering ${title} ${kind} PNG`
      : state === "saved"
        ? `${title} ${kind} PNG saved`
        : state === "error"
          ? `${title} ${kind} PNG failed`
          : `Download ${title} ${kind} PNG`;

  return (
    <button
      className={styles.actionButton}
      type="button"
      aria-label={label}
      aria-busy={state === "rendering"}
      data-state={state}
      data-capture-exclude
      disabled={state === "rendering"}
      title={label}
      onClick={() => void capture()}
    >
      <ScreenshotIcon />
    </button>
  );
}
