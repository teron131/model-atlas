/** Graph section layout owns its sky-set chapter heading, its research plane, and the element captured for PNG export. */

import { type CSSProperties, type ReactNode, useRef } from "react";

import { CaptureButton } from "../capture/CaptureButton";
import { CopyDashboardLink } from "../CopyDashboardLink";
import { type ResearchRegionId, researchRegionOrdinal } from "../research-index";

import styles from "./graphs.module.css";

/** The heading opens the region on the sky and the plane below holds its figure; exports capture both but drop the actions. */
export function Panel({
  sectionId,
  sectionLabel,
  title,
  children,
  wide = false,
  captureWidth,
  captureFileName,
}: {
  sectionId: ResearchRegionId;
  sectionLabel: string;
  title: string;
  children: ReactNode;
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
      className={`dashboard-research-section ${wide ? `${styles.section} ${styles.wide}` : styles.section}`}
      ref={panelRef}
      style={captureStyle}
      aria-labelledby={titleId}
    >
      <header className="dashboard-section-head">
        <h2 id={titleId} className="dashboard-section-title">
          <b aria-hidden="true">{ordinal}</b>
          <span>{sectionLabel}</span>
        </h2>
        <div className="dashboard-section-actions" data-capture-exclude>
          <CaptureButton
            captureWidth={artifactWidth}
            fileName={captureFileName}
            targetRef={panelRef}
            title={title}
          />
          <CopyDashboardLink sectionId={sectionId} />
        </div>
      </header>
      <div className={`research-plane ${styles.panel}`}>{children}</div>
    </article>
  );
}
