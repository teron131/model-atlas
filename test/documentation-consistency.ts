/** Check published Markdown formulas, local heading links, and registered figure dimensions; editorial choices and mathematical meaning require contextual review. */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import katex from "katex";

import {
  documentAssetPath,
  documentImageSize,
  headingId,
  METHODOLOGY_ASSET_NAMES,
} from "../app/methodology/documents";

const DOCS_DIR = "docs";

const files = [...markdownFiles(DOCS_DIR), "README.md"];
const headings = new Map(files.map((file) => [normalize(file), headingIds(read(file))]));
const referencedAssets = new Set<string>();
const problems: string[] = [];

for (const file of files) {
  const text = read(file);
  const prose = text.replace(/`[^`\n]*`/g, "");
  const math = mathExpressions(prose);

  for (const { tex, display } of math) {
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true });
    } catch {
      problems.push(`${file}: math does not render: ${tex}`);
    }
  }

  for (const [, target, anchor] of text.matchAll(/\]\(([^)#\s]*)#([a-z0-9-]+)\)/g)) {
    if (target!.startsWith("http")) continue;
    const destination = normalize(target ? join(dirname(file), target) : file);
    if (!headings.get(destination)?.has(anchor!)) {
      problems.push(`${file}: link ${target}#${anchor} has no matching heading`);
    }
  }

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
