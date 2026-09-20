/** Server-rendered reading surface for repository documentation. */

import "katex/dist/katex.min.css";
import Link from "next/link";

import benchmarks from "../../docs/benchmarks.md";
import imputation from "../../docs/imputation.md";
import intelligenceAgentic from "../../docs/intelligence-agentic.md";
import leaderboardRules from "../../docs/leaderboard-rules.md";
import matching from "../../docs/matching.md";
import methodology from "../../docs/methodology.md";
import speedValue from "../../docs/speed-value.md";
import standards from "../../docs/standards.md";
import timeline from "../../docs/timeline.md";
import { documentHref, DOCUMENTS, type DocumentSlug, tableOfContents } from "./documents";
import { DocumentShell } from "./DocumentShell";
import { MarkdownDocument } from "./MarkdownDocument";

import styles from "./methodology.module.css";

const DOCUMENT_CONTENT = {
  standards,
  benchmarks,
  matching,
  methodology,
  timeline,
  "intelligence-agentic": intelligenceAgentic,
  imputation,
  "speed-value": speedValue,
  "leaderboard-rules": leaderboardRules,
};

export function DocumentPage({ document }: { document: DocumentSlug }) {
  const { markdown, revision } = DOCUMENT_CONTENT[document];
  const outline = tableOfContents(markdown);
  const current = DOCUMENTS.find((item) => item.slug === document)!;
  const sequence = DOCUMENTS.filter((item) => item.group === current.group);
  const index = sequence.findIndex((item) => item.slug === document);
  const previous = sequence[index - 1];
  const next = sequence[index + 1];

  return (
    <DocumentShell activeDocument={document} outline={outline}>
      <article className={styles.article} data-document-revision={revision}>
        <MarkdownDocument markdown={markdown} />
        <nav className={styles.pageSequence} aria-label="Reading order">
          {previous ? (
            <Link href={documentHref(previous.slug)} prefetch={false} rel="prev">
              <small>Previous</small>
              <span>{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={documentHref(next.slug)} prefetch={false} rel="next">
              <small>Next</small>
              <span>{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </article>
    </DocumentShell>
  );
}
