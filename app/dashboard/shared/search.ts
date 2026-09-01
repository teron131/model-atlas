/** Dashboard metadata search ranks target-specific identity and context fields without a remote embedding dependency. */

const MIN_QUERY_TERM_COVERAGE = 0.6;
const MIN_RELATIVE_SEARCH_SCORE = 0.2;

export type SearchDocument<T> = {
  value: T;
  primary: unknown;
  context?: unknown;
};

type SearchPattern = {
  expression: RegExp;
};

type ScoredSearchDocument<T> = {
  document: SearchDocument<T>;
  coverage: number;
  score: number;
};

/** Filter target documents through one weighted keyword policy while preserving the target owner's display order. */
export function filterSearchDocuments<T>(
  query: string,
  documents: readonly SearchDocument<T>[],
): T[] {
  const search = buildSearchQuery(query);
  if (search == null) {
    return documents.map(({ value }) => value);
  }
  const scored = documents
    .map((document) => scoreSearchDocument(document, search.query, search.patterns))
    .filter((candidate) => candidate.coverage >= MIN_QUERY_TERM_COVERAGE && candidate.score > 0);
  const maxScore = Math.max(0, ...scored.map(({ score }) => score));
  return scored
    .filter(({ score }) => score >= maxScore * MIN_RELATIVE_SEARCH_SCORE)
    .map(({ document }) => document.value);
}

export function hasSearchQuery(query: string): boolean {
  return buildSearchQuery(query) != null;
}

function buildSearchQuery(query: string): { patterns: SearchPattern[]; query: string } | null {
  const normalizedQuery = query.toLocaleLowerCase("en").replaceAll(/\s+/g, " ").trim();
  if (normalizedQuery.length === 0) {
    return null;
  }
  const patterns = normalizedQuery
    .split(" ")
    .filter(Boolean)
    .map((term) => ({ expression: createSearchPattern(term) }));
  return patterns.length > 0 ? { patterns, query: normalizedQuery } : null;
}

function scoreSearchDocument<T>(
  document: SearchDocument<T>,
  query: string,
  patterns: SearchPattern[],
): ScoredSearchDocument<T> {
  const primary = collectTextValues(document.primary).map(normalizeSearchText).filter(Boolean);
  const context = collectTextValues(document.context).map(normalizeSearchText).filter(Boolean);
  const queryPattern = createSearchPattern(query);
  let score = 0;
  if (primary.some((value) => value === query)) {
    score += 12;
  }
  if (primary.some((value) => queryPattern.test(value))) {
    score += 6;
  } else if (context.some((value) => queryPattern.test(value))) {
    score += 4;
  }
  let matchedTerms = 0;
  for (const pattern of patterns) {
    if (primary.some((value) => pattern.expression.test(value))) {
      matchedTerms += 1;
      score += 2;
    } else if (context.some((value) => pattern.expression.test(value))) {
      matchedTerms += 1;
      score += 0.75;
    }
  }
  return {
    document,
    coverage: matchedTerms / patterns.length,
    score,
  };
}

function collectTextValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectTextValues);
  }
  if (value != null && typeof value === "object") {
    return Object.values(value).flatMap(collectTextValues);
  }
  return [];
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("en").replaceAll(/\s+/g, " ").trim();
}

function createSearchPattern(value: string): RegExp {
  const source = value.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${source}($|[^\\p{L}\\p{N}])`, "iu");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
