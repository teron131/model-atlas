/** Section wrapper used by dashboard graph panels. */

import { type CSSProperties, type ReactNode, type RefObject, useRef } from "react";

import { CaptureButton } from "../capture/CaptureButton";

import styles from "./graphs.module.css";

export function Panel({
  sectionId,
  sectionLabel,
  title,
  copy,
  summary,
  children,
  note,
  wide = false,
  captureWidth,
  captureFileName,
  captureEnabled = true,
  panelRef,
}: {
  sectionId: string;
  sectionLabel: string;
  title: string;
  copy?: string;
  summary?: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  wide?: boolean;
  captureWidth: number;
  captureFileName?: string;
  captureEnabled?: boolean;
  panelRef?: RefObject<HTMLElement | null>;
}) {
  const fallbackPanelRef = useRef<HTMLElement>(null);
  const resolvedPanelRef = panelRef ?? fallbackPanelRef;
  const artifactWidth = captureWidth + 48;
  const captureStyle = {
    "--capture-artifact-width": `${artifactWidth}px`,
  } as CSSProperties;
  const titleId = `${sectionId}-title`;

  return (
    <article
      id={sectionId}
      className={wide ? `${styles.panel} ${styles.wide}` : styles.panel}
      ref={resolvedPanelRef}
      style={captureStyle}
      aria-labelledby={titleId}
    >
      <div className={styles.panelHead}>
        <p className={styles.sectionMarker}>
          <b>{sectionLabel}</b>
        </p>
        {summary == null ? null : <div className={styles.panelSide}>{summary}</div>}
        <div className={styles.panelTitleBlock}>
          <div className={styles.panelTitleWrap}>
            <h2 id={titleId}>{title}</h2>
            {captureEnabled ? (
              <CaptureButton
                captureWidth={artifactWidth}
                fileName={captureFileName}
                targetRef={resolvedPanelRef}
                title={title}
              />
            ) : null}
          </div>
          {copy ? <p className={styles.panelCopy}>{copy}</p> : null}
        </div>
      </div>
      {children}
      {note ? <div className={styles.note}>{note}</div> : null}
    </article>
  );
}
