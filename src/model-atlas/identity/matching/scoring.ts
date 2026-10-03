/** Scoring policy for deciding whether benchmark source names and catalog model IDs refer to the same LLM. */

import { claudeIdentityKey, parseClaudeIdentity } from "../claude";
import {
  modelSlugFromModelId,
  normalizeModelToken,
  normalizeProviderModelId,
} from "../normalization";
import { hasQwenMaxTier } from "../qwen";
import {
  commonPrefixLength,
  firstParsedNumber,
  isNumericToken,
  parseActiveBToken,
  parseBScaleToken,
  parsedNumericTokens,
  splitBaseModelTokens,
  splitTokens,
} from "./name-tokens";
import type { MatchCandidate, MatchCandidateInput, MatcherConfig } from "./types";

/** Raw identity stays available for provider-aware and Claude rules; token rules share one preparation per ranking. */
type MatchName = {
  value: string;
  tokens: string[];
};

const TOKEN_PREFIX_WEIGHTS = [5, 4, 3, 2, 1] as const;
const TOKEN_PREFIX_REWARD_MULTIPLIER = 2;
const NUMERIC_EXACT_MATCH_REWARD = 2;
const NUMERIC_CLOSENESS_REWARD_SCALE = 0.1;
const NUMERIC_ALL_EQUAL_REWARD = 0.2;
const VARIANT_SUFFIX_REWARD = 2;
const COVERAGE_EXACT_REWARD = 4;
const COVERAGE_MISSING_BASE_PENALTY = 1;
const B_SCALE_EXACT_REWARD = 3;
const B_SCALE_MISMATCH_PENALTY = 4;
const B_SCALE_MISSING_PENALTY = 2;
const ACTIVE_B_EXACT_REWARD = 2;
const ACTIVE_B_MISMATCH_PENALTY = 2;
const CHAR_PREFIX_REWARD_SCALE = 0.03;
const LENGTH_GAP_PENALTY_SCALE = 0.005;
const CLAUDE_IDENTITY_EXACT_REWARD = 20;
const UNVERSIONED_CURRENT_VERSION_REWARD = 6;
const REQUIRED_IDENTITY_LABELS = ["vl", "coder"] as const;
const EXCLUSIVE_SIZE_LABELS = ["small", "micro"] as const;
const ARTIFICIAL_ANALYSIS_EFFORT_SUFFIXES = [
  "-ultra",
  "-max",
  "-adaptive",
  "-xhigh",
  "-high",
  "-medium",
  "-low",
  "-minimal",
  "-non-reasoning",
] as const;
const COVERAGE_IGNORED_TOKENS = new Set([
  "preview",
  "ultra",
  "max",
  "adaptive",
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "non",
]);
/** Collapse Artificial Analysis effort-specific slugs while retaining Qwen's semantic Max tier. */
export function artificialAnalysisMatchSlug(sourceSlug: string): string {
  for (const suffix of ARTIFICIAL_ANALYSIS_EFFORT_SUFFIXES) {
    if (sourceSlug.endsWith(suffix)) {
      if (suffix === "-max" && hasQwenMaxTier(sourceSlug)) {
        return sourceSlug;
      }
      return sourceSlug.slice(0, -suffix.length);
    }
  }
  return sourceSlug;
}

/** Variant labels are matched longest-first so compound variants like flash-lite do not double-count flash. */
function variantLabels(modelId: string, matcherConfig: MatcherConfig): Set<string> {
  const tokens = normalizeProviderModelId(modelId).split(/[-/]/).filter(Boolean);
  const occupied = new Set<number>();
  const labels = new Set<string>();
  const variants = [...matcherConfig.variantTokens].sort(
    (left, right) =>
      normalizeModelToken(right).split("-").length - normalizeModelToken(left).split("-").length,
  );

  for (const variant of variants) {
    const variantTokens = normalizeModelToken(variant).split("-");
    for (let index = 0; index <= tokens.length - variantTokens.length; index += 1) {
      if (variantTokens.some((token, offset) => tokens[index + offset] !== token)) {
        continue;
      }
      if (variantTokens.some((_token, offset) => occupied.has(index + offset))) {
        continue;
      }
      for (let offset = 0; offset < variantTokens.length; offset += 1) {
        occupied.add(index + offset);
      }
      labels.add(variant);
    }
  }

  return labels;
}

/** Reject candidates whose configured model variants disagree with the source identity. */
export function hasVariantConflict(
  sourceSlug: string,
  candidateModelId: string,
  matcherConfig: MatcherConfig,
): boolean {
  const sourceLabels = variantLabels(sourceSlug, matcherConfig);
  const candidateLabels = variantLabels(candidateModelId, matcherConfig);
  return matcherConfig.variantTokens.some(
    (token) => sourceLabels.has(token) !== candidateLabels.has(token),
  );
}

/** Require every distinguishing source token to appear in a candidate id or display name. */
function hasSourceTokenCoverage(source: MatchName, base: MatchName, name: MatchName): boolean {
  const sourceTokens = source.tokens.filter((token) => !COVERAGE_IGNORED_TOKENS.has(token));
  if (sourceTokens.length === 0) {
    return false;
  }
  const candidateTokenSets = [base.tokens, name.tokens];
  return candidateTokenSets.some((candidateTokens) => {
    const candidateTokenSet = new Set(candidateTokens);
    return sourceTokens.every((token) => candidateTokenSet.has(token));
  });
}

/** Claude tier/version identity is structural even though Anthropic changed its token order. */
function claudeIdentityMatch(source: MatchName, base: MatchName, name: MatchName): boolean | null {
  const sourceIdentity = parseClaudeIdentity(source.value);
  if (sourceIdentity == null) {
    return null;
  }
  const sourceIdentityKey = claudeIdentityKey(sourceIdentity);
  const candidateIdentities = [base.value, name.value]
    .map(parseClaudeIdentity)
    .filter((identity) => identity != null);
  if (candidateIdentities.length === 0) {
    return null;
  }
  return candidateIdentities.some((identity) => claudeIdentityKey(identity) === sourceIdentityKey);
}

function numericVersionParts(
  source: MatchName,
  base: MatchName,
  name: MatchName,
): {
  source: number[];
  candidateId: number[];
  candidateName: number[];
} {
  return {
    source: source.tokens.filter(isNumericToken).map(Number),
    candidateId: base.tokens.filter(isNumericToken).map(Number),
    candidateName: name.tokens.filter(isNumericToken).map(Number),
  };
}

function hasStrictNumericPrefix(left: number[], right: number[]): boolean {
  return (
    left.length > 0 &&
    left.length < right.length &&
    left.every((value, index) => value === right[index])
  );
}

function hasLeadingNumberMismatch(source: MatchName, base: MatchName, name: MatchName): boolean {
  const numbers = numericVersionParts(source, base, name);
  if (numbers.source.length === 0) {
    return false;
  }
  const idLeadingNumberMatches =
    numbers.candidateId.length === 0 || numbers.source[0] === numbers.candidateId[0];
  const nameLeadingNumberMatches =
    numbers.candidateName.length === 0 || numbers.source[0] === numbers.candidateName[0];
  return !idLeadingNumberMatches && !nameLeadingNumberMatches;
}

function hasNumericPrefixConflict(source: MatchName, base: MatchName, name: MatchName): boolean {
  const numbers = numericVersionParts(source, base, name);
  const idHasConflict =
    hasStrictNumericPrefix(numbers.source, numbers.candidateId) ||
    hasStrictNumericPrefix(numbers.candidateId, numbers.source);
  if (!idHasConflict) {
    return false;
  }
  return (
    numbers.candidateName.length === 0 ||
    numbers.source.length !== numbers.candidateName.length ||
    numbers.source.some((value, index) => value !== numbers.candidateName[index])
  );
}

function hasStructuralLabelConflict(source: MatchName, base: MatchName, name: MatchName): boolean {
  const sourceTokens = new Set(source.tokens);
  const candidateTokens = new Set([...base.tokens, ...name.tokens]);
  if (
    REQUIRED_IDENTITY_LABELS.some((label) => sourceTokens.has(label) !== candidateTokens.has(label))
  ) {
    return true;
  }
  const sourceSize = EXCLUSIVE_SIZE_LABELS.find((label) => sourceTokens.has(label));
  const candidateSize = EXCLUSIVE_SIZE_LABELS.find((label) => candidateTokens.has(label));
  return sourceSize != null && candidateSize != null && sourceSize !== candidateSize;
}

/** An unversioned multi-token family may represent the catalog's current explicitly versioned route. */
function unversionedCurrentVersionReward(
  source: MatchName,
  base: MatchName,
  name: MatchName,
): number {
  const sourceTokens = source.tokens;
  if (sourceTokens.length < 2 || sourceTokens.some((token) => isNumericToken(token))) {
    return 0;
  }
  const isCurrentVersion = (candidateTokens: string[]) =>
    candidateTokens.length > sourceTokens.length &&
    sourceTokens.every((token, index) => candidateTokens[index] === token) &&
    candidateTokens.slice(sourceTokens.length).every(isNumericToken);
  return [base.tokens, name.tokens].some(isCurrentVersion) ? UNVERSIONED_CURRENT_VERSION_REWARD : 0;
}

function hasNumericVersionConflict(source: MatchName, base: MatchName, name: MatchName): boolean {
  const numbers = numericVersionParts(source, base, name);
  const overlapsWithDifferentVersion = (candidate: number[]) =>
    candidate.some(
      (value, index) => numbers.source[index] != null && numbers.source[index] !== value,
    );
  const idHasConflict = overlapsWithDifferentVersion(numbers.candidateId);
  const nameHasConflict =
    numbers.candidateName.length === 0 || overlapsWithDifferentVersion(numbers.candidateName);
  return idHasConflict && nameHasConflict;
}

/** Reward leading token agreement heavily because source labels usually differ in suffixes, not family prefixes. */
function weightedTokenPrefixScore(leftTokens: string[], rightTokens: string[]): number {
  const maxLength = Math.min(leftTokens.length, rightTokens.length);
  let score = 0;
  for (let tokenIndex = 0; tokenIndex < maxLength; tokenIndex += 1) {
    if (leftTokens[tokenIndex] !== rightTokens[tokenIndex]) {
      break;
    }
    score += TOKEN_PREFIX_WEIGHTS[tokenIndex] ?? 0;
  }
  return score;
}

function numericMatchReward(source: MatchName, base: MatchName): number {
  const sourceTokens = source.tokens;
  const candidateTokens = base.tokens;
  const maxLength = Math.min(sourceTokens.length, candidateTokens.length);
  for (let tokenIndex = 0; tokenIndex < maxLength; tokenIndex += 1) {
    const sourceValue = parsedNumericTokens([sourceTokens[tokenIndex] ?? ""])[0];
    const candidateValue = parsedNumericTokens([candidateTokens[tokenIndex] ?? ""])[0];
    if (sourceValue != null && candidateValue != null) {
      return sourceValue === candidateValue ? NUMERIC_EXACT_MATCH_REWARD : 0;
    }
  }
  return 0;
}

function numericClosenessReward(source: MatchName, base: MatchName): number {
  const sourceNumbers = parsedNumericTokens(source.tokens);
  const candidateNumbers = parsedNumericTokens(base.tokens);

  const maxLength = Math.max(sourceNumbers.length, candidateNumbers.length);
  for (let numberIndex = 0; numberIndex < maxLength; numberIndex += 1) {
    const sourceValue = sourceNumbers[numberIndex];
    const candidateValue = candidateNumbers[numberIndex];
    if (sourceValue == null || candidateValue == null) {
      return 0;
    }
    if (sourceValue === candidateValue) {
      continue;
    }
    return NUMERIC_CLOSENESS_REWARD_SCALE / (1 + Math.abs(sourceValue - candidateValue));
  }
  return NUMERIC_ALL_EQUAL_REWARD;
}

function candidateScaleValue(
  base: MatchName,
  name: MatchName,
  parser: (token: string | undefined) => number | null,
): number | null {
  const baseValue = firstParsedNumber(base.tokens, parser);
  const nameValue = firstParsedNumber(name.tokens, parser);
  return baseValue ?? nameValue;
}

function bScaleRewardOrPenalty(source: MatchName, base: MatchName, name: MatchName): number {
  const sourceBScale = firstParsedNumber(source.tokens, parseBScaleToken);
  if (sourceBScale == null) {
    return 0;
  }
  const candidateBScale = candidateScaleValue(base, name, parseBScaleToken);
  if (candidateBScale == null) {
    return -B_SCALE_MISSING_PENALTY;
  }
  if (candidateBScale === sourceBScale) {
    return B_SCALE_EXACT_REWARD;
  }
  return -B_SCALE_MISMATCH_PENALTY;
}

function hasHardBScaleMismatch(source: MatchName, base: MatchName, name: MatchName): boolean {
  const sourceBScale = firstParsedNumber(source.tokens, parseBScaleToken);
  if (sourceBScale == null) {
    return false;
  }
  const candidateBScale = candidateScaleValue(base, name, parseBScaleToken);
  return candidateBScale == null || candidateBScale !== sourceBScale;
}

function activeBRewardOrPenalty(source: MatchName, base: MatchName, name: MatchName): number {
  const sourceActiveB = firstParsedNumber(source.tokens, parseActiveBToken);
  if (sourceActiveB == null) {
    return 0;
  }
  const candidateActiveB = candidateScaleValue(base, name, parseActiveBToken);
  if (candidateActiveB == null) {
    return 0;
  }
  if (candidateActiveB === sourceActiveB) {
    return ACTIVE_B_EXACT_REWARD;
  }
  return -ACTIVE_B_MISMATCH_PENALTY;
}

function sameVariantReward(source: MatchName, base: MatchName, name: MatchName): number {
  const sourceLastToken = source.tokens.at(-1);
  if (!sourceLastToken || isNumericToken(sourceLastToken)) {
    return 0;
  }
  const baseLastToken = base.tokens.at(-1);
  const nameLastToken = name.tokens.at(-1);
  if (sourceLastToken === baseLastToken || sourceLastToken === nameLastToken) {
    return VARIANT_SUFFIX_REWARD;
  }
  return 0;
}

function coverageRewardOrPenalty(source: MatchName, base: MatchName, name: MatchName): number {
  const sourceSet = new Set(source.tokens);
  const baseSet = new Set(base.tokens);
  const nameSet = new Set(name.tokens);

  /** Compare one candidate token set against the source token set. */
  function compareSets(candidateSet: Set<string>): number {
    if (sourceSet.size === 0) {
      return 0;
    }
    const missingCount = [...sourceSet].filter((token) => !candidateSet.has(token)).length;
    if (missingCount > 0) {
      return -COVERAGE_MISSING_BASE_PENALTY - missingCount;
    }
    if (candidateSet.size === sourceSet.size) {
      return COVERAGE_EXACT_REWARD;
    }
    return 0;
  }

  return Math.max(compareSets(baseSet), compareSets(nameSet));
}

function hasFirstTokenMatch(source: MatchName, base: MatchName, name: MatchName): boolean {
  // Guardrail: first-token mismatch usually means wrong model family.
  const sourceFirstToken = source.tokens[0];
  if (!sourceFirstToken) {
    return false;
  }
  return sourceFirstToken === base.tokens[0] || sourceFirstToken === name.tokens[0];
}

function scoreCandidate(source: MatchName, base: MatchName, name: MatchName): number {
  const matchesClaudeIdentity = claudeIdentityMatch(source, base, name);
  if (matchesClaudeIdentity === false) {
    return 0;
  }
  if (hasStructuralLabelConflict(source, base, name)) {
    return 0;
  }
  if (
    matchesClaudeIdentity !== true &&
    (hasLeadingNumberMismatch(source, base, name) ||
      hasNumericPrefixConflict(source, base, name) ||
      hasNumericVersionConflict(source, base, name))
  ) {
    return 0;
  }
  // Prefix reward addresses cross-family false positives.
  const normalizedSourceSlug = normalizeModelToken(source.value);
  const normalizedModelBase = normalizeModelToken(modelSlugFromModelId(base.value) ?? base.value);
  const normalizedModelName = normalizeModelToken(name.value);
  const basePrefixLength = commonPrefixLength(normalizedSourceSlug, normalizedModelBase);
  const modelNamePrefixLength = commonPrefixLength(normalizedSourceSlug, normalizedModelName);
  const maxPrefixLength = Math.max(basePrefixLength, modelNamePrefixLength);
  if (maxPrefixLength === 0) {
    return 0;
  }
  if (hasHardBScaleMismatch(source, base, name)) {
    return 0;
  }

  const weightedTokenScore = Math.max(
    weightedTokenPrefixScore(source.tokens, base.tokens),
    weightedTokenPrefixScore(source.tokens, name.tokens),
  );

  // Numeric reward keeps nearby versions ordered (e.g. 5.2 > 5.1 when 5.3 is missing).
  // Variant reward keeps suffix-sensitive families aligned (codex/haiku/opus).
  // Coverage penalty suppresses unrelated but superficially similar names.
  return (
    weightedTokenScore * TOKEN_PREFIX_REWARD_MULTIPLIER +
    numericMatchReward(source, base) +
    numericClosenessReward(source, base) +
    sameVariantReward(source, base, name) +
    bScaleRewardOrPenalty(source, base, name) +
    activeBRewardOrPenalty(source, base, name) +
    coverageRewardOrPenalty(source, base, name) +
    unversionedCurrentVersionReward(source, base, name) +
    (matchesClaudeIdentity === true ? CLAUDE_IDENTITY_EXACT_REWARD : 0) +
    maxPrefixLength * CHAR_PREFIX_REWARD_SCALE -
    Math.abs(normalizedSourceSlug.length - normalizedModelBase.length) * LENGTH_GAP_PENALTY_SCALE
  );
}

export function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return left.model_id.localeCompare(right.model_id);
}

/** Apply the first-token gate and scoring rules while preparing source tokens once and candidate tokens once per comparison. */
export function rankMatchCandidates(
  sourceSlug: string,
  candidates: readonly MatchCandidateInput[],
  options: { requireSourceTokenCoverage?: boolean } = {},
): MatchCandidate[] {
  if (sourceSlug.length === 0) {
    return [];
  }
  const source: MatchName = { value: sourceSlug, tokens: splitTokens(sourceSlug) };
  return candidates
    .flatMap((candidate) => {
      const base: MatchName = {
        value: candidate.model_id,
        tokens: splitBaseModelTokens(candidate.model_id),
      };
      const name: MatchName = {
        value: candidate.model_name ?? "",
        tokens: splitTokens(candidate.model_name ?? ""),
      };
      if (
        !hasFirstTokenMatch(source, base, name) ||
        (options.requireSourceTokenCoverage === true && !hasSourceTokenCoverage(source, base, name))
      ) {
        return [];
      }
      const score = scoreCandidate(source, base, name);
      return score > 0 ? [{ ...candidate, score }] : [];
    })
    .sort(compareCandidates);
}

/** Select the highest-ranked candidate whose configured model variants agree with the source. */
export function firstVariantCompatibleCandidate(
  sourceSlug: string,
  candidates: readonly MatchCandidate[],
  matcherConfig: MatcherConfig,
): MatchCandidate | null {
  return (
    candidates.find(
      (candidate) => !hasVariantConflict(sourceSlug, candidate.model_id, matcherConfig),
    ) ?? null
  );
}
