/** Graph section layout owns its heading actions and the element captured for PNG export. */

import { type CSSProperties, type ReactNode, useRef } from "react";

import { CaptureButton } from "../capture/CaptureButton";
import { CopyDashboardLink } from "../CopyDashboardLink";
import { type ResearchRegionId, researchRegionOrdinal } from "./research-index";

import styles from "./graphs.module.css";

/** Keep section actions out of exported images while the capture ref always targets the complete panel. */
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
}) {
  const panelRef = useRef<HTMLElement>(null);
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
      ref={panelRef}
      style={captureStyle}
      aria-labelledby={titleId}
    >
      <div className={styles.panelHead}>
        <div className="dashboard-section-top" data-capture-exclude>
          <p className={`dashboard-section-marker ${styles.sectionMarker}`}>
            <b aria-hidden="true">{ordinal}</b>
            <span>{sectionLabel}</span>
          </p>
          <div className="dashboard-section-actions">
            <CaptureButton
              captureWidth={artifactWidth}
              fileName={captureFileName}
              targetRef={panelRef}
              title={title}
            />
            <CopyDashboardLink sectionId={sectionId} />
          </div>
        </div>
        {summary == null ? null : <div className={styles.panelSide}>{summary}</div>}
        <div className={styles.panelTitleBlock}>
          <div className={styles.panelTitleWrap}>
            <h2 id={titleId}>{title}</h2>
          </div>
          {copy == null ? null : <p className={styles.panelCopy}>{copy}</p>}
        </div>
      </div>
      {children}
      {note ? <footer className={styles.note}>{note}</footer> : null}
    </article>
  );
}
