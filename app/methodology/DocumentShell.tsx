"use client";

/** Documentation shell: the document title on the sky, then one research plane holding the document strip, navigation, and text. */

import { ArrowUp, ListTree } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useState } from "react";

import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { useHorizontalChoice } from "../shared/use-horizontal-choice";
import { DocumentNavigation } from "./DocumentNavigation";
import { documentHref, DOCUMENTS, type DocumentSlug, type TableOfContentsItem } from "./documents";
import { ScoreText } from "./ScoreText";

import styles from "./methodology.module.css";

const NAVIGATION_STORAGE_KEY = "model-atlas-document-navigation-open";
// Matches the stylesheet breakpoint where shown navigation stacks above the text instead of sitting beside it.
const STACKED_NAVIGATION_QUERY = "(max-width: 719px)";

/**
 * The documentation has two modes, navigation shown or hidden, switched by the Navigation button at every width.
 * Shown navigation sits beside the text on wide screens and above it on phones; it never overlays the page.
 */
export function DocumentShell({
  children,
  activeDocument,
  outline,
  titles,
}: {
  children: ReactNode;
  activeDocument: DocumentSlug;
  outline: TableOfContentsItem[];
  titles: Record<DocumentSlug, string>;
}) {
  const currentDocument = DOCUMENTS.find((item) => item.slug === activeDocument)!;
  const stripRef = useHorizontalChoice<HTMLUListElement>(activeDocument);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  // Only the reader's own toggles are remembered, so a phone's default never hides navigation on a wide screen.
  const toggleNavigation = useCallback(() => {
    const next = !navigationOpen;
    setNavigationOpen(next);
    try {
      window.localStorage.setItem(NAVIGATION_STORAGE_KEY, String(next));
    } catch {}
  }, [navigationOpen]);

  // Navigation starts shown beside the text and hidden on phones, where it would push the text below the fold, unless the reader chose otherwise.
  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(NAVIGATION_STORAGE_KEY);
    } catch {}
    setNavigationOpen(
      stored == null ? !window.matchMedia(STACKED_NAVIGATION_QUERY).matches : stored !== "false",
    );
  }, []);

  useEffect(() => {
    const updateVisibility = () => setShowBackToTop(window.scrollY > 480);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  const scrollToPageTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <main className={`document-main ${styles.page}`}>
      <ModelAtlasHeader page="methodology" />
      {/* The document opens on the sky like a dashboard region; its navigation and text share one plane below. */}
      <h1 className={`dashboard-section-title ${styles.documentTitle}`}>
        <span>
          <ScoreText>{titles[activeDocument]}</ScoreText>
        </span>
      </h1>
      <div
        className={`research-plane ${styles.documentLayout} ${
          navigationOpen ? styles.documentLayoutWithNavigation : ""
        }`}
      >
        <nav className={styles.documentNav} aria-label="Documentation">
          <button
            type="button"
            className={`${styles.navigationIconButton} ${styles.contentsToggle}`}
            aria-label={navigationOpen ? "Hide navigation" : "Show navigation"}
            title={navigationOpen ? "Hide navigation" : "Show navigation"}
            aria-controls="document-navigation"
            aria-expanded={navigationOpen}
            onClick={toggleNavigation}
          >
            <ListTree aria-hidden="true" />
          </button>
          <ul ref={stripRef} className="horizontal-choice-strip">
            {DOCUMENTS.filter((item) => item.parent === null).map((item) => (
              <li key={item.slug}>
                <Link
                  className="selection-choice"
                  href={documentHref(item.slug)}
                  prefetch={false}
                  aria-current={
                    item.slug === activeDocument || item.slug === currentDocument.parent
                      ? "page"
                      : undefined
                  }
                >
                  <span>
                    <ScoreText>{titles[item.slug]}</ScoreText>
                  </span>
                  <small>{item.description}</small>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {children}
        {navigationOpen ? (
          <DocumentNavigation activeDocument={activeDocument} outline={outline} titles={titles} />
        ) : null}
      </div>
      <button
        className={`${styles.backToTop} ${showBackToTop ? styles.backToTopVisible : ""}`}
        type="button"
        aria-label="Back to top"
        aria-hidden={!showBackToTop}
        tabIndex={showBackToTop ? 0 : -1}
        onClick={scrollToPageTop}
      >
        <ArrowUp aria-hidden="true" />
      </button>
    </main>
  );
}
