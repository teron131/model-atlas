"use client";

/** Inline document switcher and section tree, shown beside the text on wide screens and above it on phones. */

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DocumentOutline } from "./DocumentOutline";
import { documentHref, DOCUMENTS, type DocumentSlug, type TableOfContentsItem } from "./documents";
import { ScoreText } from "./ScoreText";

import styles from "./methodology.module.css";

/** Open the active document's group on entry while preserving manual group toggles on the current page. */
export function DocumentNavigation({
  activeDocument,
  outline,
  titles,
}: {
  activeDocument: DocumentSlug;
  outline: TableOfContentsItem[];
  titles: Record<DocumentSlug, string>;
}) {
  const activeGroup =
    DOCUMENTS.find((item) => item.slug === activeDocument)!.parent ?? activeDocument;
  const [expanded, setExpanded] = useState<DocumentSlug[]>([activeGroup]);

  useEffect(() => {
    setExpanded((current) => (current.includes(activeGroup) ? current : [...current, activeGroup]));
  }, [activeDocument, activeGroup]);

  return (
    <aside
      className={styles.documentNavigation}
      id="document-navigation"
      aria-label="Document navigation"
    >
      <nav className={styles.documentSwitcher} aria-label="Documents">
        <ul>
          {DOCUMENTS.filter((item) => item.parent === null).map((item) => (
            <li key={item.slug}>
              <div className={styles.documentRow}>
                <Link
                  href={documentHref(item.slug)}
                  prefetch={false}
                  aria-current={item.slug === activeDocument ? "page" : undefined}
                >
                  <span>
                    <ScoreText>{titles[item.slug]}</ScoreText>
                  </span>
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
                      >
                        <span>
                          <ScoreText>{titles[child.slug]}</ScoreText>
                        </span>
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

      <DocumentOutline items={outline} />
    </aside>
  );
}
