/** Check published Markdown formulas, heading links to local or deployed documents, version markers, and registered figure dimensions; editorial choices and mathematical meaning require contextual review. */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import katex from "katex";

import {
  CATALOG_VERSIONS,
  documentAssetPath,
  documentHref,
  documentImageSize,
  DOCUMENTS,
  fillVersionMarkers,
  headingId,
  METHODOLOGY_ASSET_NAMES,
} from "../app/methodology/documents";

const DOCS_DIR = "docs";
const SITE = "https://llmstats.vercel.app";

const files = [...markdownFiles(DOCS_DIR), "README.md"];
const headings = new Map(files.map((file) => [normalize(file), headingIds(read(file))]));
const referencedAssets = new Set<string>();
const problems: string[] = [];

for (const file of files) {
  const text = read(file);
  const prose = text.replace(/`[^`\n]*`/g, "");
  const math = mathExpressions(prose);

  try {
    fillVersionMarkers(prose, CATALOG_VERSIONS);
  } catch (error) {
    problems.push(`${file}: ${String(error)}; add a catalog version`);
  }

  for (const { tex, display } of math) {
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true });
    } catch {
      problems.push(`${file}: math does not render: ${tex}`);
    }
  }

  for (const [, target, anchor] of text.matchAll(/\]\(([^)#\s]*)#([a-z0-9-]+)\)/g)) {
    if (target!.startsWith("http") && !target!.startsWith(SITE)) continue;
    const destination = linkedDocument(file, target!);
    if (destination == null || !headings.get(destination)?.has(anchor!)) {
      problems.push(`${file}: link ${target}#${anchor} has no matching heading`);
    }
  }

  // The app serves only the docs, so README images, which GitHub shows, need no registration.
  if (file === "README.md") continue;
  for (const [, source] of text.matchAll(/\]\(([^)\s]+\.svg)\)/g)) {
    const asset = source!.split("/").at(-1)!;
    if (!(METHODOLOGY_ASSET_NAMES as readonly string[]).includes(asset)) {
      problems.push(`${file}: ${asset} is not registered in METHODOLOGY_ASSETS`);
      continue;
    }
    referencedAssets.add(asset);
    const svg = read(
      join(DOCS_DIR, documentAssetPath(asset as (typeof METHODOLOGY_ASSET_NAMES)[number])),
    );
    const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg) ?? [];
    const size = documentImageSize(source!);
    if (Number(width) !== size.width || Number(height) !== size.height) {
      problems.push(
        `${asset}: registered size ${size.width}×${size.height} differs from viewBox ${width}×${height}`,
      );
    }
  }
}

for (const asset of METHODOLOGY_ASSET_NAMES) {
  if (!referencedAssets.has(asset))
    problems.push(`${asset} is registered but no document shows it`);
}

assert.deepEqual(problems, [], `Documentation problems:\n${problems.join("\n")}`);

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") && entry.name !== "AGENTS.md" ? [path] : [];
  });
}

/** The Markdown file a link renders: a relative path, or a deployed document page; `null` for a deployed page no document serves. */
function linkedDocument(file: string, target: string): string | null {
  if (!target.startsWith(SITE)) return normalize(target ? join(dirname(file), target) : file);
  const page = DOCUMENTS.find((document) => SITE + documentHref(document.slug) === target);
  return page == null ? null : normalize(join(DOCS_DIR, page.source));
}

function headingIds(markdown: string): Set<string> {
  return new Set([...markdown.matchAll(/^#{2,4} (.+)$/gm)].map(([, label]) => headingId(label!)));
}

/** Display math sits between lines of `$$`; inline math is a single-line `$…$` span. */
function mathExpressions(markdown: string): { tex: string; display: boolean }[] {
  const display = [...markdown.matchAll(/\$\$\n([\s\S]*?)\n\$\$/g)].map(([, tex]) => ({
    tex: tex!,
    display: true,
  }));
  const withoutDisplay = markdown.replace(/\$\$\n[\s\S]*?\n\$\$/g, "");
  const inline = [...withoutDisplay.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g)].map(([, tex]) => ({
    tex: tex!,
    display: false,
  }));
  return [...display, ...inline];
}
