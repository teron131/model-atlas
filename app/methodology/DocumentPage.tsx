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
import { readRevalidatedPayload } from "../../src/model-atlas/database/runtime-snapshot";
import { NavigationLink } from "../shared/NavigationLink";
import {
  CATALOG_VERSIONS,
  documentGroup,
  documentHref,
  DOCUMENTS,
  type DocumentSlug,
  documentTitle,
  fillVersionMarkers,
  tableOfContents,
} from "./documents";
import { DocumentShell } from "./DocumentShell";
import { MarkdownDocument } from "./MarkdownDocument";
import { ScoreText } from "./ScoreText";

import styles from "./methodology.module.css";

// The snapshot read sets this page's regeneration interval.
const VERSION_REVALIDATE_SECONDS = 3600;

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
  const versions = { ...CATALOG_VERSIONS, ...(await servedVersions()) };
  const outline = tableOfContents(markdown);
  const parent = documentGroup(document);
  const sequence = DOCUMENTS.filter((item) => item.slug === parent || item.parent === parent);
  const index = sequence.findIndex((item) => item.slug === document);
  const previous = sequence[index - 1];
  const next = sequence[index + 1];

  return (
    <DocumentShell activeDocument={document} outline={outline} titles={documentTitles}>
      <article className={styles.article} data-document-revision={revision}>
        <MarkdownDocument markdown={fillVersionMarkers(markdown, versions)} document={document} />
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

/** Documentation stays renderable with catalog versions when the served snapshot is unreachable, such as during an offline build. */
async function servedVersions(): Promise<Readonly<Record<string, string>>> {
  try {
    return (
      (await readRevalidatedPayload(VERSION_REVALIDATE_SECONDS)).metadata.benchmark_versions ?? {}
    );
  } catch (error) {
    unstable_rethrow(error);
    console.warn("Documentation versions fell back to catalog versions", error);
    return {};
  }
}
