"use client";

/** Methodology figures: phones shrink each to the column's width, where its labels are too small to read, so a tap opens it full-screen. */

import { X } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";

import { useMediaQuery } from "../shared/use-media-query";

import styles from "./methodology.module.css";

// Matches the stylesheet breakpoint where figures shrink to the column's width.
const SHRUNK_FIGURE_QUERY = "(max-width: 719px)";
// An opened figure's 15px labels read at about the caption size; one wider than the screen scrolls sideways, and a phone turned sideways shows it whole.
const OPENED_SCALE = 0.75;

export function DocumentFigure({
  src,
  alt,
  width,
  height,
  caption,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: ReactNode;
}) {
  const shrunk = useMediaQuery(SHRUNK_FIGURE_QUERY);
  const [open, setOpen] = useState(false);
  const image = <Image src={src} alt={alt} width={width} height={height} loading="eager" />;
  const figureCaption =
    caption == null ? null : (
      <span className={styles.figureCaption} aria-hidden="true">
        {caption}
      </span>
    );

  return (
    <span className={styles.figure}>
      <span
        className={styles.figureViewport}
        role="region"
        aria-label="Illustration"
        tabIndex={shrunk ? undefined : 0}
      >
        {shrunk ? (
          <button
            type="button"
            className={styles.figureEnlarge}
            aria-label="Enlarge illustration"
            onClick={() => setOpen(true)}
          >
            {image}
          </button>
        ) : (
          image
        )}
      </span>
      {figureCaption}
      {/* Figures sit inside Markdown paragraphs, which cannot hold a dialog, so it opens at the end of the body. */}
      {open
        ? createPortal(
            <dialog
              ref={(dialog) => {
                // Strict Mode attaches the ref twice, and the second attach finds the dialog already open.
                if (dialog != null && !dialog.open) dialog.showModal();
              }}
              className={styles.figureDialog}
              aria-label="Illustration"
              onClose={() => setOpen(false)}
            >
              <form method="dialog">
                <button
                  type="submit"
                  className="dashboard-action-button"
                  aria-label="Close illustration"
                  title="Close"
                >
                  <X aria-hidden="true" />
                </button>
              </form>
              <span className={styles.figureDialogViewport}>
                <Image
                  src={src}
                  alt={alt}
                  width={width}
                  height={height}
                  loading="eager"
                  style={{ width: `max(${width * OPENED_SCALE}px, min(100%, ${width}px))` }}
                />
              </span>
              {figureCaption}
            </dialog>,
            document.body,
          )
        : null}
    </span>
  );
}
