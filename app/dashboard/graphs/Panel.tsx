/** Section wrapper used by dashboard graph panels. */

import { type CSSProperties, type ReactNode, type RefObject, useRef } from "react";

import { CaptureButton } from "../capture/CaptureButton";
import { type ResearchRegionId, researchRegionOrdinal } from "./research-index";

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
  sectionId: ResearchRegionId;
  sectionLabel: string;
  title: string;
  copy?: ReactNode;
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
  const ordinal = researchRegionOrdinal(sectionId);

  return (
    <article
      id={sectionId}
      className={wide ? `${styles.panel} ${styles.wide}` : styles.panel}
      ref={resolvedPanelRef}
      style={captureStyle}
      aria-labelledby={titleId}
    >
      <div className={styles.panelHead}>
        {/* The rail already names the sequence for screen readers. */}
        <p className={styles.sectionMarker}>
          <b aria-hidden="true">{ordinal}</b>
          <span>{sectionLabel}</span>
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
          {copy == null ? null : <p className={styles.panelCopy}>{copy}</p>}
        </div>
      </div>
      {children}
      {note ? <footer className={styles.note}>{note}</footer> : null}
    </article>
  );
}
