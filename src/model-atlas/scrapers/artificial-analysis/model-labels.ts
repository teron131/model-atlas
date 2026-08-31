/** Shared Artificial Analysis model-label cleanup and reasoning-effort parsing. */

const DISPLAY_SUFFIX_PATTERN =
  /\s*\((?:[^)]*(?:fallback|not currently available|unavailable|adaptive reasoning|max effort)[^)]*)\)\s*/gi;
const NON_REASONING_PATTERN = /\b(?:non|no) reasoning\b/;
const REASONING_EFFORT_PATTERNS = [
  { effort: "max", pattern: /\bmax(?:imum)?(?: effort)?\b/ },
  { effort: "xhigh", pattern: /\b(?:xhigh|extra high)(?: effort)?\b/ },
  { effort: "high", pattern: /\bhigh(?: effort)?\b/ },
  { effort: "medium", pattern: /\bmedium(?: effort)?\b/ },
  { effort: "low", pattern: /\blow(?: effort)?\b/ },
  { effort: "minimal", pattern: /\bminimal(?: effort)?\b/ },
] as const;

/** Remove transient availability/fallback qualifiers from Artificial Analysis model names. */
export function cleanArtificialAnalysisModelName(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const cleaned = value.replace(DISPLAY_SUFFIX_PATTERN, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : value;
}

/** Extract one consistent reasoning effort from Artificial Analysis name parentheticals. */
export function parseArtificialAnalysisReasoningEffort(...values: unknown[]): string | null {
  let resolvedEffort: string | null = null;
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    for (const match of value.matchAll(/\(([^)]*)\)/g)) {
      const effort = reasoningEffortLabel(match[1]);
      if (effort != null) {
        if (resolvedEffort != null && resolvedEffort !== effort) {
          return null;
        }
        resolvedEffort = effort;
      }
    }
  }
  return resolvedEffort;
}

function reasoningEffortLabel(value: string | undefined): string | null {
  const label = value?.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (label == null) {
    return null;
  }
  if (NON_REASONING_PATTERN.test(label)) {
    return "none";
  }
  const efforts = new Set<string>();
  let remainingLabel = label;
  for (const { effort, pattern } of REASONING_EFFORT_PATTERNS) {
    if (pattern.test(remainingLabel)) {
      efforts.add(effort);
      remainingLabel = remainingLabel.replace(pattern, " ");
    }
  }
  return efforts.size === 1 ? ([...efforts][0] ?? null) : null;
}
