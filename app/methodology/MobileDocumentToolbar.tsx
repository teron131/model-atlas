"use client";

/** Fixed mobile controls keep home and document navigation accessible while reading. */

import { ListTree } from "lucide-react";
import Link from "next/link";

import { DOCUMENTS, type DocumentSlug } from "./documents";

import styles from "./methodology.module.css";

export function MobileDocumentToolbar({
  activeDocument,
  navigationOpen,
  onToggleNavigation,
}: {
  activeDocument: DocumentSlug;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
}) {
  const currentDocument = DOCUMENTS.find((item) => item.slug === activeDocument) ?? DOCUMENTS[0];

  return (
    <header className={styles.mobileToolbar}>
      <Link
        className={`brand-lockup ${styles.mobileHomeLink}`}
        href="/"
        prefetch={false}
        aria-label="Model Atlas home"
      >
        <span className="brand-mark" aria-hidden="true" />
        <span className={`brand-title ${styles.mobileToolbarTitle}`}>{currentDocument.title}</span>
      </Link>
      <div className={styles.mobileToolbarActions}>
        <button
          className={styles.navigationIconButton}
          type="button"
          aria-label={navigationOpen ? "Hide document navigation" : "Show document navigation"}
          aria-controls="document-navigation"
          aria-expanded={navigationOpen}
          onClick={onToggleNavigation}
        >
          <ListTree aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
