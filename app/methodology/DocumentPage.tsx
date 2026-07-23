/** Server-rendered reading surface for repository documentation. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";

import { DocumentShell } from "./DocumentShell";
import {
	DOCUMENTS,
	type DocumentSlug,
	documentHref,
	tableOfContents,
} from "./documents";
import { MarkdownDocument } from "./MarkdownDocument";
import styles from "./methodology.module.css";

export async function DocumentPage({ document }: { document: DocumentSlug }) {
	const markdown = await readFile(
		join(process.cwd(), "docs", `${document}.md`),
		"utf8",
	);
	const outline = tableOfContents(markdown);

	return (
		<DocumentShell activeDocument={document} outline={outline}>
			<nav className={styles.documentNav} aria-label="Documentation">
				<ul>
					{DOCUMENTS.map((item) => (
						<li key={item.slug}>
							<Link
								href={documentHref(item.slug)}
								aria-current={item.slug === document ? "page" : undefined}
							>
								<span>{item.title}</span>
								<small>{item.description}</small>
							</Link>
						</li>
					))}
				</ul>
			</nav>

			<article className={styles.article}>
				<MarkdownDocument markdown={markdown} />
			</article>
		</DocumentShell>
	);
}
