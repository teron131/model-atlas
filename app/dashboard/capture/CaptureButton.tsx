/** Direct screenshot action for a dashboard surface: a graph panel or a model sheet. */

"use client";

import type { RefObject } from "react";

import { ScreenshotIcon } from "../shared/DashboardIcons";
import { captureFileToken } from "./png";
import { type CaptureWidth, usePngCapture } from "./use-png";

import styles from "./capture.module.css";

/** Download a referenced surface while keeping the action itself out of the image; `kind` names the surface in the button's label. */
export function CaptureButton({
  targetRef,
  title,
  captureWidth,
  fileName,
  kind = "graph",
}: {
  targetRef: RefObject<HTMLElement | null>;
  title: string;
  captureWidth: CaptureWidth;
  fileName?: string;
  kind?: string;
}) {
  const { capture, state } = usePngCapture(
    targetRef,
    fileName ?? `model-atlas-${captureFileToken(title)}`,
    captureWidth,
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
