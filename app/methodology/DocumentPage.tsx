/** Server-rendered reading surface for repository documentation. */

import "katex/dist/katex.min.css";
import benchmarks from "../../docs/benchmarks.md";
import matching from "../../docs/matching.md";
import methodology from "../../docs/methodology.md";
import standards from "../../docs/standards.md";
import timeline from "../../docs/timeline.md";
import { type DocumentSlug, tableOfContents } from "./documents";
import { DocumentShell } from "./DocumentShell";
import { MarkdownDocument } from "./MarkdownDocument";

import styles from "./methodology.module.css";

const DOCUMENT_CONTENT = { standards, benchmarks, matching, methodology, timeline };

export function DocumentPage({ document }: { document: DocumentSlug }) {
  const { markdown, revision } = DOCUMENT_CONTENT[document];
  const outline = tableOfContents(markdown);

  return (
    <DocumentShell activeDocument={document} outline={outline}>
      <article className={styles.article} data-document-revision={revision}>
        <MarkdownDocument markdown={markdown} />
      </article>
    </DocumentShell>
  );
}
