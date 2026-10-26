/** Server-rendered reading surface for repository documentation. */

import "katex/dist/katex.min.css";
import { unstable_rethrow } from "next/navigation";

import benchmarks from "../../docs/benchmarks.md";
import matching from "../../docs/matching.md";
import imputation from "../../docs/methodology/imputation.md";
import intelligenceAgentic from "../../docs/methodology/intelligence-agentic.md";
import leaderboardRules from "../../docs/methodology/leaderboard-rules.md";
import methodologyOverview from "../../docs/methodology/overview.md";
import speedValue from "../../docs/methodology/speed-value.md";
import standards from "../../docs/standards.md";
import timelineCalculation from "../../docs/timeline/calculation.md";
import timeline from "../../docs/timeline/overview.md";
import { readRevalidatedSnapshot } from "../../src/model-atlas/database/runtime-snapshot";
import { NavigationLink } from "../shared/NavigationLink";
import {
  CATALOG_EDITIONS,
  documentHref,
  DOCUMENTS,
  type DocumentSlug,
  documentTitle,
  fillEditionMarkers,
  tableOfContents,
} from "./documents";
import { DocumentShell } from "./DocumentShell";
import { MarkdownDocument } from "./MarkdownDocument";
import { ScoreText } from "./ScoreText";

import styles from "./methodology.module.css";

// The snapshot read sets this page's regeneration interval.
const EDITION_REVALIDATE_SECONDS = 3600;

const DOCUMENT_CONTENT = {
  standards,
  benchmarks,
  matching,
  methodology: methodologyOverview,
  timeline,
  "timeline/calculation": timelineCalculation,
  "intelligence-agentic": intelligenceAgentic,
  imputation,
  "speed-value": speedValue,
  "leaderboard-rules": leaderboardRules,
};

const documentTitles = Object.fromEntries(
  DOCUMENTS.map((item) => [
    item.slug,
    documentTitle(DOCUMENT_CONTENT[item.slug].markdown, item.title),
  ]),
) as Record<DocumentSlug, string>;

export async function DocumentPage({ document }: { document: DocumentSlug }) {
  const { markdown, revision } = DOCUMENT_CONTENT[document];
  const editions = { ...CATALOG_EDITIONS, ...(await servedEditions()) };
  const outline = tableOfContents(markdown);
  const current = DOCUMENTS.find((item) => item.slug === document)!;
  const parent = current.parent ?? current.slug;
  const sequence = DOCUMENTS.filter((item) => item.slug === parent || item.parent === parent);
  const index = sequence.findIndex((item) => item.slug === document);
  const previous = sequence[index - 1];
  const next = sequence[index + 1];

  return (
    <DocumentShell activeDocument={document} outline={outline} titles={documentTitles}>
      <article className={styles.article} data-document-revision={revision}>
        <MarkdownDocument markdown={fillEditionMarkers(markdown, editions)} document={document} />
        {previous || next ? (
          <nav className={styles.pageSequence} aria-label="Reading order">
            {previous ? (
              <NavigationLink href={documentHref(previous.slug)} rel="prev">
                <small>Previous</small>
                <span>
                  <span className={styles.linkLabel}>
                    <ScoreText>{documentTitles[previous.slug]}</ScoreText>
                  </span>
                </span>
              </NavigationLink>
            ) : (
              <span />
            )}
            {next ? (
              <NavigationLink href={documentHref(next.slug)} rel="next">
                <small>Next</small>
                <span>
                  <span className={styles.linkLabel}>
                    <ScoreText>{documentTitles[next.slug]}</ScoreText>
                  </span>
                </span>
              </NavigationLink>
            ) : null}
          </nav>
        ) : null}
      </article>
    </DocumentShell>
  );
}

/** Documentation stays renderable with catalog editions when the served snapshot is unreachable, such as during an offline build. */
async function servedEditions(): Promise<Readonly<Record<string, string>>> {
  try {
    return (
      (await readRevalidatedSnapshot(EDITION_REVALIDATE_SECONDS)).metadata.benchmark_editions ?? {}
    );
  } catch (error) {
    unstable_rethrow(error);
    console.warn("Documentation editions fell back to catalog versions", error);
    return {};
  }
}
