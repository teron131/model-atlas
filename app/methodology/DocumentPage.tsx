/** Server-rendered reading surface for repository documentation. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import "katex/dist/katex.min.css";

import { type DocumentSlug, tableOfContents } from "./documents";
import { DocumentShell } from "./DocumentShell";
import { MarkdownDocument } from "./MarkdownDocument";

import styles from "./methodology.module.css";

export async function DocumentPage({ document }: { document: DocumentSlug }) {
  const markdown = await readFile(join(process.cwd(), "docs", `${document}.md`), "utf8");
  const outline = tableOfContents(markdown);

  return (
    <DocumentShell activeDocument={document} outline={outline}>
      <article className={styles.article}>
        <MarkdownDocument markdown={markdown} />
      </article>
    </DocumentShell>
  );
}
