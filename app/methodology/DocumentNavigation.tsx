"use client";

/** Responsive document switcher and section tree for docked and sheet layouts. */

import { ChevronDown, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
  const [expanded, setExpanded] = useState<DocumentSlug[]>([]);

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
        <ul>
          {DOCUMENTS.filter((item) => item.parent === null).map((item) => (
            <li key={item.slug}>
              <div className={styles.documentRow}>
                <Link
                  href={documentHref(item.slug)}
                  prefetch={false}
                  aria-current={item.slug === activeDocument ? "page" : undefined}
                  onClick={isSheet ? onClose : undefined}
                >
                  <span>{item.title}</span>
                  <small>{item.description}</small>
                </Link>
                {DOCUMENTS.some((child) => child.parent === item.slug) ? (
                  <button
                    type="button"
                    className={styles.navigationIconButton}
                    aria-label={`${expanded.includes(item.slug) ? "Collapse" : "Expand"} ${item.title}`}
                    aria-expanded={expanded.includes(item.slug)}
                    aria-controls={`document-children-${item.slug}`}
                    onClick={() =>
                      setExpanded((current) =>
                        current.includes(item.slug)
                          ? current.filter((slug) => slug !== item.slug)
                          : [...current, item.slug],
                      )
                    }
                  >
                    {expanded.includes(item.slug) ? (
                      <ChevronDown aria-hidden="true" />
                    ) : (
                      <ChevronRight aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </div>
              {DOCUMENTS.some((child) => child.parent === item.slug) ? (
                <ul id={`document-children-${item.slug}`} hidden={!expanded.includes(item.slug)}>
                  {DOCUMENTS.filter((child) => child.parent === item.slug).map((child) => (
                    <li key={child.slug}>
                      <Link
                        href={documentHref(child.slug)}
                        prefetch={false}
                        aria-current={child.slug === activeDocument ? "page" : undefined}
                        onClick={isSheet ? onClose : undefined}
                      >
                        <span>{child.title}</span>
                        <small>{child.description}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
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
