"use client";

/** Copy the explicit dashboard configuration for its owning section without changing browser history. */

import { Link as LinkIcon } from "lucide-react";
import { useState } from "react";

import type { ResearchRegionId } from "./graphs/research-index";

import styles from "./capture/capture.module.css";

export function CopyDashboardLink({ sectionId }: { sectionId: ResearchRegionId }) {
  const [status, setStatus] = useState("Copy link");

  /** Preserve the current query while targeting this section, and report clipboard denial without navigating. */
  async function copyLink() {
    const url = new URL(window.location.href);
    url.hash = sectionId;
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus("Link copied");
    } catch {
      setStatus("Copy failed — use the address bar");
    }
  }
  return (
    <button
      className={styles.actionButton}
      type="button"
      aria-label={status}
      title={status}
      onClick={copyLink}
      onBlur={() => setStatus("Copy link")}
    >
      <LinkIcon aria-hidden="true" />
      <span className="visually-hidden" role="status">
        {status}
      </span>
    </button>
  );
}
