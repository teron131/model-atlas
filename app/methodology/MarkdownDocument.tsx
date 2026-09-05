/** Render repository Markdown with stable headings and content-versioned SVGs so artwork edits bypass stale browser caches. */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { documentImageSize, documentImageSource, documentLink, headingId } from "./documents";

import styles from "./methodology.module.css";

export function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      components={markdownComponents}
      rehypePlugins={[rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkMath]}
    >
      {markdown}
    </ReactMarkdown>
  );
}

/** Fingerprint trusted local artwork during server rendering; small SVGs load eagerly for section-link visits. */
const MarkdownImage: NonNullable<Components["img"]> = async ({ src = "", alt = "" }) => {
  if (typeof src !== "string") {
    return null;
  }
  const size = documentImageSize(src);
  let imageSource = documentImageSource(src);
  if (imageSource !== src) {
    const source = await readFile(join(process.cwd(), "docs", src));
    const revision = createHash("sha256").update(source).digest("hex").slice(0, 16);
    imageSource += `?v=${revision}`;
  }
  return (
    <span className={styles.figure}>
      <span className={styles.figureViewport} role="region" aria-label="Illustration" tabIndex={0}>
        <Image
          src={imageSource}
          alt={alt}
          width={size.width}
          height={size.height}
          loading="eager"
        />
      </span>
      {alt === "" ? null : <span aria-hidden="true">{alt}</span>}
    </span>
  );
};

const markdownComponents: Components = {
  h2: ({ children }) => <h2 id={headingId(textContent(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={headingId(textContent(children))}>{children}</h3>,
  h4: ({ children }) => <h4 id={headingId(textContent(children))}>{children}</h4>,
  a: ({ href = "", children, ...props }) => {
    const resolvedHref = documentLink(href);
    return resolvedHref.startsWith("/") ? (
      <Link href={resolvedHref} prefetch={false} {...props}>
        {children}
      </Link>
    ) : (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className={styles.tableViewport} role="region" aria-label="Table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  img: MarkdownImage,
};

function textContent(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(textContent).join("");
  }
  if (
    children != null &&
    typeof children === "object" &&
    "props" in children &&
    children.props != null &&
    typeof children.props === "object" &&
    "children" in children.props
  ) {
    return textContent(children.props.children as ReactNode);
  }
  return "";
}
