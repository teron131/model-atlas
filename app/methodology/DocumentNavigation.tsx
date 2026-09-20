"use client";

/** Responsive document switcher and section tree for docked and sheet layouts. */

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { DocumentOutline } from "./DocumentOutline";
import { documentHref, DOCUMENTS, type DocumentSlug, type TableOfContentsItem } from "./documents";

import styles from "./methodology.module.css";

type DocumentNavigationMode = "docked" | "sheet";

export function DocumentNavigation({
  activeDocument,
  outline,
  mode,
  onClose,
}: {
  activeDocument: DocumentSlug;
  outline: TableOfContentsItem[];
  mode: DocumentNavigationMode;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isSheet = mode === "sheet";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    if (isSheet) {
      document.body.style.overflow = "hidden";
      closeButtonRef.current?.focus();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isSheet, onClose]);

  const navigation = (
    <>
      <div className={styles.documentNavigationHeader}>
        <p>Navigate</p>
        <button
          ref={closeButtonRef}
          className={styles.navigationIconButton}
          type="button"
          aria-label="Close document navigation"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>

      <nav className={styles.documentSwitcher} aria-label="Documents">
        {[...new Set(DOCUMENTS.map((item) => item.group))].map((group) => (
          <div key={group} className={styles.documentGroup}>
            <p className={styles.railLabel}>{group}</p>
            <ul>
              {DOCUMENTS.filter((item) => item.group === group).map((item) => (
                <li key={item.slug}>
                  <Link
                    href={documentHref(item.slug)}
                    prefetch={false}
                    aria-current={item.slug === activeDocument ? "page" : undefined}
                    onClick={isSheet ? onClose : undefined}
                  >
                    <span>{item.title}</span>
                    <small>{item.description}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <DocumentOutline items={outline} onNavigate={isSheet ? onClose : undefined} />
    </>
  );

  return (
    <div className={styles.documentNavigationLayer} data-mode={mode}>
      <button
        className={styles.documentNavigationBackdrop}
        type="button"
        aria-label="Close document navigation"
        onClick={onClose}
      />
      <aside
        className={styles.documentNavigationPanel}
        id="document-navigation"
        aria-label="Document navigation"
        aria-modal={isSheet ? true : undefined}
        role={isSheet ? "dialog" : undefined}
      >
        {navigation}
      </aside>
    </div>
  );
}
