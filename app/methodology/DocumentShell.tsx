"use client";

/** Responsive documentation shell with shared navigation and reading controls. */

import { ArrowUp, ListTree } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DocumentNavigation } from "./DocumentNavigation";
import { documentHref, DOCUMENTS, type DocumentSlug, type TableOfContentsItem } from "./documents";

import styles from "./methodology.module.css";

const DOCKED_NAVIGATION_QUERY = "(min-width: 1100px)";
const NAVIGATION_STORAGE_KEY = "model-atlas-document-navigation-open";

export function DocumentShell({
  children,
  activeDocument,
  outline,
}: {
  children: ReactNode;
  activeDocument: DocumentSlug;
  outline: TableOfContentsItem[];
}) {
  const currentDocument = DOCUMENTS.find((item) => item.slug === activeDocument)!;
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const navigationHydrated = useRef(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationDocked = navigationOpen && isDesktop;
  const toggleNavigation = useCallback(() => {
    setNavigationOpen((open) => !open);
  }, []);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);

  // Remember the desktop sidebar preference; narrow screens start with the drawer closed.
  useLayoutEffect(() => {
    if (!navigationHydrated.current) {
      navigationHydrated.current = true;
      try {
        const saved = window.localStorage.getItem(NAVIGATION_STORAGE_KEY);
        setNavigationOpen(window.matchMedia(DOCKED_NAVIGATION_QUERY).matches && saved !== "false");
      } catch {}
      return;
    }
    if (!window.matchMedia(DOCKED_NAVIGATION_QUERY).matches) return;
    try {
      window.localStorage.setItem(NAVIGATION_STORAGE_KEY, String(navigationOpen));
    } catch {}
  }, [navigationOpen]);

  useEffect(() => {
    const updateVisibility = () => setShowBackToTop(window.scrollY > 480);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(DOCKED_NAVIGATION_QUERY);
    const updateLayout = () => setIsDesktop(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  const scrollToPageTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <main className={styles.page}>
      <ModelAtlasHeader page="methodology" />
      <div
        className={`${styles.documentLayout} ${
          navigationDocked ? styles.documentLayoutWithNavigation : ""
        }`}
      >
        <nav className={styles.documentNav} aria-label="Documentation">
          <button
            type="button"
            className={`${styles.navigationIconButton} ${styles.contentsToggle}`}
            aria-label={navigationOpen ? "Hide document navigation" : "Show document navigation"}
            title={navigationOpen ? "Hide document navigation" : "Show document navigation"}
            aria-controls="document-navigation"
            aria-expanded={navigationOpen}
            onClick={toggleNavigation}
          >
            <ListTree aria-hidden="true" />
            <span>Documentation</span>
          </button>
          <ul>
            {DOCUMENTS.filter(
              (item) => item.group === "Reference" || item.slug === "methodology",
            ).map((item) => (
              <li key={item.slug}>
                <Link
                  href={documentHref(item.slug)}
                  prefetch={false}
                  aria-current={
                    item.slug === activeDocument ||
                    (item.slug === "methodology" && currentDocument.group === "Methodology")
                      ? "page"
                      : undefined
                  }
                >
                  <span>{item.slug === "methodology" ? "Methodology" : item.title}</span>
                  <small>{item.description}</small>
                </Link>
              </li>
            ))}
          </ul>

          <span className={styles.currentDocument}>{currentDocument.title}</span>
        </nav>

        {children}
        {navigationOpen ? (
          <DocumentNavigation
            activeDocument={activeDocument}
            outline={outline}
            mode={isDesktop ? "docked" : "sheet"}
            onClose={closeNavigation}
          />
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
