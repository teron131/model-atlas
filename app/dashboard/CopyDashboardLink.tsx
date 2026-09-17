"use client";

/** Copy the explicit dashboard configuration for its owning section without changing browser history. */

import { Check as CheckIcon, CircleAlert, Link as LinkIcon } from "lucide-react";
import { useState } from "react";

import type { ResearchRegionId } from "./graphs/research-index";

import styles from "./capture/capture.module.css";

const feedback = {
  idle: { label: "Copy link", Icon: LinkIcon },
  saved: { label: "Link copied", Icon: CheckIcon },
  error: { label: "Copy failed — use the address bar", Icon: CircleAlert },
};

export function CopyDashboardLink({ sectionId }: { sectionId: ResearchRegionId }) {
  const [status, setStatus] = useState<keyof typeof feedback>("idle");
  const { label, Icon } = feedback[status];

  /** Preserve the current query while targeting this section, and report clipboard denial without navigating. */
  async function copyLink() {
    const url = new URL(window.location.href);
    url.hash = sectionId;
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }
  return (
    <button
      className={styles.actionButton}
      type="button"
      data-state={status}
      aria-label={label}
      title={label}
      onClick={copyLink}
      onBlur={() => setStatus("idle")}
    >
      <Icon aria-hidden="true" />
      <span className="visually-hidden" role="status">
        {label}
      </span>
    </button>
  );
}
