/** Render repository Markdown with stable headings, subsection guides, responsive flow lists and content-versioned artwork. */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Image from "next/image";
import Link from "next/link";
import { Children, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { DocumentHeading } from "./DocumentHeading";
import { documentImageSize, documentImageSource, documentLink, headingId } from "./documents";

import styles from "./methodology.module.css";

export function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      components={markdownComponents}
      rehypePlugins={[rehypeKatex, subsectionGuides]}
      remarkPlugins={[remarkGfm, remarkMath]}
    >
      {markdown}
    </ReactMarkdown>
  );
}

/** Nest content guides below h2 and h3 headings, keeping each heading outside its own guide. */
function subsectionGuides() {
  type Node = {
    type: string;
    tagName?: string;
    properties?: Record<string, string | undefined>;
    children?: Node[];
  };
  return (tree: { children: Node[] }) => {
    const children: Node[] = [];
    let section: Node[] | undefined;
    let subsection: Node[] | undefined;
    for (const node of tree.children) {
      if (node.type !== "element" || !/^h[1-3]$/.test(node.tagName ?? "")) {
        (subsection ?? section ?? children).push(node);
        continue;
      }
      subsection = undefined;
      if (node.tagName !== "h3") section = undefined;
      if (node.tagName === "h1") {
        children.push(node);
        continue;
      }
      const content: Node[] = [];
      (section ?? children).push({
        type: "element",
        tagName: "section",
        properties: { className: styles.section },
        children: [
          node,
          {
            type: "element",
            tagName: "div",
            properties: { className: styles.subsection },
            children: content,
          },
        ],
      });
      if (node.tagName === "h2") section = content;
      else subsection = content;
    }
    tree.children = children;
  };
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
  h2: ({ children }) => (
    <DocumentHeading level={2} id={headingId(textContent(children))}>
      {children}
    </DocumentHeading>
  ),
  h3: ({ children }) => (
    <DocumentHeading level={3} id={headingId(textContent(children))}>
      {children}
    </DocumentHeading>
  ),
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
  // Diagram callouts keep their content in Markdown and render as accessible HTML.
  blockquote: ({ children }) => {
    const blocks = Children.toArray(children);
    const first = blocks.findIndex((block) => textContent(block).trim() !== "");
    const marker = textContent(blocks[first]).trim();
    if (marker === "[!MAP]") {
      const content = blocks.slice(first + 1).filter((block) => textContent(block).trim() !== "");
      return (
        <nav className={styles.documentMap} aria-label={textContent(content[0]).trim()}>
          {content}
        </nav>
      );
    }
    if (marker !== "[!FLOW]") {
      return <blockquote>{children}</blockquote>;
    }
    return <div className={styles.flowchart}>{blocks.slice(first + 1)}</div>;
  },
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
