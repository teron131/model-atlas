/** Render repository Markdown with stable headings, subsection guides, responsive flow lists, content-versioned artwork, and plain domain tables drawn as the dashboard draws them: a chip for each Domain cell and a share bar for each Domain Shares cell. */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Children, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { DomainChip, isBenchmarkDomain } from "../shared/DomainShares";
import { NavigationLink } from "../shared/NavigationLink";
import { DomainShareBar } from "../shared/ShareBar";
import { DocumentFigure } from "./DocumentFigure";
import { DocumentHeading } from "./DocumentHeading";
import {
  documentAssetPath,
  documentImageSize,
  documentLink,
  type DocumentSlug,
  DOMAIN_COLUMNS,
  domainShareList,
  headingId,
  methodologyAsset,
  namedDomain,
} from "./documents";
import { plainScoreText, scoreMentions, type ScoreName } from "./score-markers";
import { ScoreLabel, ScoreText } from "./ScoreText";

import styles from "./methodology.module.css";

export function MarkdownDocument({
  markdown,
  document,
}: {
  markdown: string;
  document: DocumentSlug;
}) {
  return (
    <ReactMarkdown
      components={{
        ...markdownComponents,
        a: ({ href = "", children, ...props }) => {
          const resolvedHref = documentLink(href, document);
          return resolvedHref.startsWith("/") ? (
            <NavigationLink href={resolvedHref} {...props}>
              <span className={styles.linkLabel}>{children}</span>
            </NavigationLink>
          ) : (
            <a href={resolvedHref} {...props}>
              <span className={styles.linkLabel}>{children}</span>
            </a>
          );
        },
      }}
      rehypePlugins={[domainColumns, scoreMentions, rehypeKatex, subsectionGuides]}
      remarkPlugins={[remarkGfm, remarkMath]}
      skipHtml
    >
      {markdown}
    </ReactMarkdown>
  );
}

/** Mark a table's Domain cells to draw their domain's chip and its Domain Shares cells to draw a share bar, keeping each bar's row label on one line and letting a narrow share table stack its rows; the Markdown itself stays plain text. */
function domainColumns() {
  type Node = {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, string | undefined>;
    children?: Node[];
  };
  const elements = (node: Node, tagName: string) =>
    (node.children ?? []).filter((child) => child.tagName === tagName);
  const text = (node: Node): string =>
    node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(text).join("");
  function visit(node: Node) {
    if (node.tagName !== "table") {
      node.children?.forEach(visit);
      return;
    }
    const [head] = elements(node, "thead").flatMap((part) => elements(part, "tr"));
    const headers = head == null ? [] : elements(head, "th").map((cell) => text(cell).trim());
    const domainColumn = headers.indexOf(DOMAIN_COLUMNS.domain);
    const sharesColumn = headers.indexOf(DOMAIN_COLUMNS.shares);
    if (domainColumn === -1 && sharesColumn === -1) return;
    if (sharesColumn !== -1)
      node.properties = { ...node.properties, className: styles.domainSharesTable };
    for (const row of elements(node, "tbody").flatMap((part) => elements(part, "tr"))) {
      const cells = elements(row, "td");
      const domainCell = cells[domainColumn];
      if (domainCell != null) {
        const name = text(domainCell).trim();
        domainCell.children = [
          {
            type: "element",
            tagName: "span",
            properties: { "data-domain": namedDomain(name) },
            children: [{ type: "text", value: name }],
          },
        ];
      }
      const sharesCell = cells[sharesColumn];
      if (sharesCell != null) {
        const shares = text(sharesCell).trim();
        sharesCell.properties = { ...sharesCell.properties, className: styles.domainSharesCell };
        sharesCell.children = [
          {
            type: "element",
            tagName: "div",
            properties: { "data-domain-shares": shares },
            children: [],
          },
        ];
        const [label] = cells;
        if (label != null && label !== sharesCell)
          label.properties = { ...label.properties, className: styles.domainBenchmark };
      }
    }
  }
  return visit;
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
      // The shell sets the document title on the sky, so the Markdown title is not repeated in the plane.
      if (node.tagName === "h1") continue;
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
  const asset = methodologyAsset(src);
  let imageSource = src;
  if (asset != null) {
    const source = await readFile(join(process.cwd(), "docs", documentAssetPath(asset)));
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    imageSource = `/methodology-assets/${asset}?v=${hash}`;
  }
  return (
    <DocumentFigure
      src={imageSource}
      alt={plainScoreText(alt)}
      width={size.width}
      height={size.height}
      caption={alt === "" ? null : <ScoreText>{alt}</ScoreText>}
    />
  );
};

const markdownComponents: Components = {
  div: ({ node, children, ...props }) => {
    const shares = node?.properties["data-domain-shares"];
    const domains = typeof shares === "string" ? domainShareList(shares) : null;
    return domains == null ? (
      <div {...props}>{children}</div>
    ) : (
      <DomainShareBar domains={domains} />
    );
  },
  span: ({ node, children, ...props }) => {
    const score = node?.properties["data-score"];
    const domain = node?.properties["data-domain"];
    if (typeof score === "string") return <ScoreLabel score={score as ScoreName} />;
    if (typeof domain === "string" && isBenchmarkDomain(domain))
      return (
        <span className={styles.domainName}>
          <DomainChip domain={domain} />
          {children}
        </span>
      );
    return <span {...props}>{children}</span>;
  },
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
  table: ({ children, className }) => (
    <div className={styles.tableViewport} role="region" aria-label="Table" tabIndex={0}>
      <table className={className}>{children}</table>
    </div>
  ),
  // A blockquote opening with `[!FLOW]` renders its remaining blocks as a flowchart; any other blockquote stays a quote.
  blockquote: ({ children }) => {
    const blocks = Children.toArray(children);
    const first = blocks.findIndex((block) => textContent(block).trim() !== "");
    const marker = textContent(blocks[first]).trim();
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
