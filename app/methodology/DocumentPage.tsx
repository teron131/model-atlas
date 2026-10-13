/** Server-rendered reading surface for repository documentation. */

import "katex/dist/katex.min.css";
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
import { NavigationLink } from "../shared/NavigationLink";
import {
  documentHref,
  DOCUMENTS,
  type DocumentSlug,
  documentTitle,
  tableOfContents,
} from "./documents";
import { DocumentShell } from "./DocumentShell";
import { MarkdownDocument } from "./MarkdownDocument";
import { ScoreText } from "./ScoreText";

import styles from "./methodology.module.css";

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

export function DocumentPage({ document }: { document: DocumentSlug }) {
  const { markdown, revision } = DOCUMENT_CONTENT[document];
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
        <MarkdownDocument markdown={markdown} document={document} />
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
