/** Construct, reconcile, and audit historical model identities; provider, effort, release date, and Artificial Analysis version constrain which observations may be joined. */

import { STAGE_CONFIG } from "../config";
import { modelNameIdentityKey, runMatcher } from "../identity";
import {
  canonicalModelKey,
  normalizeModelToken,
  parseModelEffort,
} from "../identity/normalization";
import { providerIdentityKey } from "../identity/provider";
import {
  isSameRelease,
  MONTH_YEAR_LABEL,
  normalizeDateLabel,
  releaseLabelPeriod,
  versionDate,
} from "../identity/releases";
import type { HistoricalDataset, HistoricalModel, HistoricalObservation } from "./schemas";

/** Construct a source identity from its base name, effort, and date before Artificial Analysis reconciliation. */
export function historicalSourceModel(
  name: string,
  provider: string,
  effort: string | null,
  date: unknown,
): HistoricalModel {
  // A reasoning label anywhere in the name gives way to one space before the effort is parsed: "Grok 4 (Reasoning) Fast" → "Grok 4 Fast".
  const parsed = parseModelEffort(
    name.replace(/\s*\((?:Non-reasoning|Reasoning)\)\s*/gi, " ").trim(),
  );
  const family = canonicalModelKey({ name: parsed.baseModel });
  const resolved = effort ?? parsed.reasoningEffort;
  return {
    id: `${family}::${resolved ?? "unknown"}`,
    family,
    name: parsed.baseModel,
    provider,
    effort: resolved,
    releaseDate: dateOrNull(date),
    current: false,
  };
}

/** The date prefix of an ISO date or timestamp: `"2025-06-17T08:00:00Z"` → `"2025-06-17"`. */
function dateOrNull(value: unknown): string | null {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value.slice(0, 10)
    : null;
}

/**
 * Reconcile Artificial Analysis slugs against retained dated API versions, never against a filtered or current-only catalog.
 * Archived Artificial Analysis releases that reused a current model's name split off as rows of their own.
 * A release date that contradicts its month label is dropped, and an effort row's earlier date moves up to its family's corroborated version date.
 * Each `name:` row's observed source versions are indexed, and rows sharing an Artificial Analysis stable slug are grouped.
 * A dated frozen row with no source version stands in as a dated version under its own name.
 * Rows sharing a stable slug join, apart from rows with several versions, and a slug reused across releases splits by release.
 * A dated version is a match target when its row has one date and no source reports several versions for it.
 * Each slug group joins the one target the shared matcher picks within its release, provider and effort.
 * An explicit source configuration joins an exactly equal Artificial Analysis identity.
 * Each group a matcher confirmed takes one resolved identity, and its rows' observations merge onto it.
 * Spelling variants of one release share a family.
 */
export function resolveHistoricalModelIdentities(
  models: HistoricalModel[],
  observations: HistoricalObservation[],
): { models: HistoricalModel[]; observations: HistoricalObservation[] } {
  ({ models, observations } = separateHistoricalReleases(models, observations));
  models = models
    .map((model) => ({ ...model, releaseDate: validHistoricalReleaseDate(model) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  models = corroboratedEffortReleaseDates(models, observations);
  const byId = new Map(models.map((model) => [model.id, model]));
  const frozenIds = new Set(
    observations.filter((o) => o.referenceConfidence != null).map((o) => o.modelId),
  );
  const index = versionIndex(byId, observations);
  const references = frozenNameReferences(models, frozenIds, index);
  const joins = new IdentityJoins(models, observations);
  const slugGroups = joinStableSlugs(index, byId, joins);
  const candidates = datedCandidates(index, references);
  joinDatedVersions(slugGroups, candidates, references, index, joins);
  // Explicit source IDs protect configurations from fuzzy matching, but must not duplicate an exact, independently compatible Artificial Analysis identity.
  for (const [source, target] of exactArtificialAnalysisAliases(models, observations)) {
    joins.tryJoin(source.id, target.id);
    joins.matched.add(source.id);
    joins.matched.add(target.id);
  }
  const { models: resolved, aliases } = resolveGroups(joins, byId, frozenIds, candidates);
  const merged = mergeAliasedObservations(observations, aliases);
  return {
    models: reconcileFamilyLabels(resolved, frozenIds).sort((a, b) => a.id.localeCompare(b.id)),
    observations: merged,
  };
}

/** Move an effort configuration's release date up to its family's dated version when the observations corroborate exactly one. */
function corroboratedEffortReleaseDates(
  models: HistoricalModel[],
  observations: HistoricalObservation[],
): HistoricalModel[] {
  const familyKey = (model: HistoricalModel) =>
    `${providerIdentityKey(model.provider)}\0${model.family}`;
  const byId = new Map(models.map((model) => [model.id, model]));
  const releaseDates = new Map<string, Set<string>>();
  for (const observation of observations) {
    const model = byId.get(observation.modelId);
    const date = observation.sourceModelVersion
      ? versionDate(observation.sourceModelVersion)
      : null;
    // A dated version and the source model's release metadata must corroborate each other before correcting an earlier effort label.
    if (!model || !date || date !== model.releaseDate) continue;
    const dates = releaseDates.get(familyKey(model)) ?? new Set<string>();
    dates.add(date);
    releaseDates.set(familyKey(model), dates);
  }
  return models.map((model) => {
    const dates = releaseDates.get(familyKey(model));
    const date = dates?.size === 1 ? [...dates][0] : null;
    return model.effort != null && date && model.releaseDate && model.releaseDate < date
      ? { ...model, releaseDate: date }
      : model;
  });
}

type DatedVersion = { model: HistoricalModel; version: string; date: string };

type ArtificialAnalysisGroup = { version: string; ids: Set<string> };

type VersionIndex = {
  artificialAnalysisGroups: Map<string, ArtificialAnalysisGroup>;
  artificialAnalysisVersions: Map<string, Set<string>>;
  measuredVersions: Map<string, Set<string>>;
  datedVersions: Map<string, DatedVersion>;
};

function versionIndex(
  byId: ReadonlyMap<string, HistoricalModel>,
  observations: HistoricalObservation[],
): VersionIndex {
  const artificialAnalysisGroups = new Map<string, ArtificialAnalysisGroup>();
  const artificialAnalysisVersions = new Map<string, Set<string>>();
  const measuredVersions = new Map<string, Set<string>>();
  const datedVersions = new Map<string, DatedVersion>();
  for (const observation of observations) {
    const model = byId.get(observation.modelId);
    const version = observation.sourceModelVersion;
    // Disambiguated source configurations cannot be collapsed by a base-model matcher.
    if (!model?.id.startsWith("name:") || !version) continue;
    const date =
      versionDate(version) ??
      (!isArtificialAnalysisObservation(observation) ? validHistoricalReleaseDate(model) : null);
    if (date) datedVersions.set(`${model.id}\0${version}`, { model, version, date });
    if (!isArtificialAnalysisObservation(observation)) {
      const versions = measuredVersions.get(model.id) ?? new Set<string>();
      versions.add(version);
      measuredVersions.set(model.id, versions);
      continue;
    }
    const versions = artificialAnalysisVersions.get(model.id) ?? new Set<string>();
    versions.add(version);
    artificialAnalysisVersions.set(model.id, versions);
    const key = `${providerIdentityKey(model.provider)}\0${model.effort}\0${version}\0${/with fallback/i.test(model.name)}`;
    const group = artificialAnalysisGroups.get(key) ?? { version, ids: new Set<string>() };
    group.ids.add(model.id);
    artificialAnalysisGroups.set(key, group);
  }
  return { artificialAnalysisGroups, artificialAnalysisVersions, measuredVersions, datedVersions };
}

/** Counted per source kind: one Artificial Analysis version beside one other source's version is not several. */
function hasSeveralVersions(index: VersionIndex, id: string): boolean {
  return (
    (index.artificialAnalysisVersions.get(id)?.size ?? 0) > 1 ||
    (index.measuredVersions.get(id)?.size ?? 0) > 1
  );
}

/** Frozen catalog names still identify models even when their checkpoint did not retain external source slugs. */
function frozenNameReferences(
  models: HistoricalModel[],
  frozenIds: ReadonlySet<string>,
  index: VersionIndex,
): DatedVersion[] {
  return models.flatMap((model) => {
    if (
      !frozenIds.has(model.id) ||
      !model.releaseDate ||
      index.artificialAnalysisVersions.has(model.id) ||
      index.measuredVersions.has(model.id)
    )
      return [];
    const version = normalizeModelToken(normalizeDateLabel(model.name));
    return [{ model, version, date: model.releaseDate }];
  });
}

class IdentityJoins {
  /** Ids a matcher confirmed; only a group holding one takes a resolved identity. */
  readonly matched = new Set<string>();
  private readonly models: HistoricalModel[];
  private readonly observations: HistoricalObservation[];
  private readonly parent: Map<string, string>;

  constructor(models: HistoricalModel[], observations: HistoricalObservation[]) {
    this.models = models;
    this.observations = observations;
    this.parent = new Map(models.map((model) => [model.id, model.id]));
  }

  /** Join two rows' groups unless the joined group would hold measurements of one benchmark at one time that differ in value or in Artificial Analysis version; returns whether the rows share a group. */
  tryJoin(left: string, right: string): boolean {
    const a = this.root(left),
      b = this.root(right);
    if (a === b) return true;
    const measurements = new Map<string, HistoricalObservation>();
    for (const observation of this.observations) {
      const group = this.root(observation.modelId);
      if (group !== a && group !== b) continue;
      const key = `${observation.benchmarkId}\0${observation.observedAt}`;
      const previous = measurements.get(key);
      if (
        previous &&
        (Math.abs(previous.value - observation.value) > 1e-9 ||
          (isArtificialAnalysisObservation(previous) &&
            previous.sourceModelVersion !== observation.sourceModelVersion))
      )
        return false;
      measurements.set(key, observation);
    }
    this.parent.set(a < b ? b : a, a < b ? a : b);
    return true;
  }

  members(id: string): HistoricalModel[] {
    const root = this.root(id);
    return this.models.filter((model) => this.root(model.id) === root);
  }

  sameGroup(left: string, right: string): boolean {
    return this.root(left) === this.root(right);
  }

  groups(): HistoricalModel[][] {
    const groups = new Map<string, HistoricalModel[]>();
    for (const model of this.models) {
      const id = this.root(model.id);
      const group = groups.get(id) ?? [];
      group.push(model);
      groups.set(id, group);
    }
    return [...groups.values()];
  }

  private root(id: string): string {
    const next = this.parent.get(id)!;
    return next === id ? id : this.root(next);
  }
}

/** An Artificial Analysis stable slug joins shortened labels before cross-source matching; returns the slug groups once rows with several versions leave them and a reused slug splits by release. */
function joinStableSlugs(
  index: VersionIndex,
  byId: ReadonlyMap<string, HistoricalModel>,
  joins: IdentityJoins,
): Map<string, ArtificialAnalysisGroup> {
  const whole = new Map<string, ArtificialAnalysisGroup>();
  const byRelease = new Map<string, ArtificialAnalysisGroup>();
  for (const [key, { version, ids }] of index.artificialAnalysisGroups) {
    const members = [...ids]
      .filter((id) => !hasSeveralVersions(index, id))
      .map((id) => byId.get(id)!);
    if (!members.length) continue;
    const periods = members.flatMap((m) => releasePeriod(m) ?? []);
    if (!periods.some((a) => periods.some((b) => !isSameRelease(a, b)))) {
      whole.set(key, { version, ids: new Set(members.map((m) => m.id)) });
      continue;
    }
    // Reused slugs remain separate by known release; an undated member cannot choose between generations.
    for (const period of new Set(periods)) {
      const dated = members.filter((m) => releasePeriod(m) === period);
      byRelease.set(`${key}\0${period}`, { version, ids: new Set(dated.map((m) => m.id)) });
    }
  }
  // A release's group is joined as it stands, after the whole ones: its members share one period, so it is never split again.
  const groups = new Map([...whole, ...byRelease]);
  for (const { version, ids } of groups.values()) {
    const members = [...ids].map((id) => byId.get(id)!);
    for (const id of ids) joins.tryJoin(members[0]!.id, id);
    const dated = members.find((m) => m.releaseDate);
    if (members.length > 1 && dated && matchesVersion(dated, dated, version))
      joins.matched.add(dated.id);
  }
  return groups;
}

/** Whether the shared matcher identifies `source`, read under the API `version`, with `target` listed as that version. */
function matchesVersion(
  source: HistoricalModel,
  target: HistoricalModel,
  version: string,
): boolean {
  const match = runMatcher(
    [
      {
        sourceId: source.id,
        sourceSlug: version,
        sourceName: source.name,
        sourceProvider: source.provider,
        sourceReleaseDate: source.releaseDate,
      },
    ],
    {
      openRouter: [
        {
          provider_id: target.provider,
          provider_name: target.provider,
          model_id: version,
          model: { name: target.name, release_date: target.releaseDate },
        },
      ],
      fallback: [],
    },
    1,
    STAGE_CONFIG.matcher,
  ).models[0]!.best_match;
  return match != null;
}

function datedCandidates(index: VersionIndex, references: DatedVersion[]): DatedVersion[] {
  const datedVersions = [...index.datedVersions.values(), ...references];
  const datesByModel = new Map<string, Set<string>>();
  for (const { model, date } of datedVersions) {
    const dates = datesByModel.get(model.id) ?? new Set<string>();
    dates.add(date);
    datesByModel.set(model.id, dates);
  }
  return datedVersions
    .filter(
      ({ model }) => datesByModel.get(model.id)!.size === 1 && !hasSeveralVersions(index, model.id),
    )
    .sort((a, b) => a.model.id.localeCompare(b.model.id) || a.version.localeCompare(b.version));
}

function joinDatedVersions(
  slugGroups: ReadonlyMap<string, ArtificialAnalysisGroup>,
  candidates: DatedVersion[],
  references: DatedVersion[],
  index: VersionIndex,
  joins: IdentityJoins,
): void {
  const nameOnlyReferences = new Set(references.map(({ model }) => model.id));
  for (const [, { version, ids }] of [...slugGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const members = joins.members([...ids][0]!);
    const source =
      members.find((m) => m.releaseDate) ?? members.find((m) => releasePeriod(m)) ?? members[0]!;
    const period = releasePeriod(source);
    if (!period) continue;
    const eligible = candidates.filter(
      ({ model, date }) =>
        providerIdentityKey(model.provider) === providerIdentityKey(source.provider) &&
        model.effort === source.effort &&
        (!nameOnlyReferences.has(model.id) ||
          historicalNameKey(model.name) === historicalNameKey(source.name) ||
          historicalNameKey(model.name) === shortVersionBase(source)) &&
        isSameRelease(period, model.releaseDate ?? date),
    );
    if (!eligible.length) continue;
    const result = runMatcher(
      [
        {
          sourceId: source.id,
          sourceSlug: version,
          sourceName: source.name,
          sourceProvider: source.provider,
          sourceReleaseDate: source.releaseDate,
          matchSlugOverride: eligible.some(
            ({ model }) => historicalNameKey(model.name) === historicalNameKey(source.name),
          )
            ? normalizeModelToken(normalizeDateLabel(source.name))
            : undefined,
        },
      ],
      {
        openRouter: eligible.map(({ model, version: candidateVersion }) => ({
          provider_id: model.provider,
          provider_name: model.provider,
          model_id: candidateVersion,
          model: { name: normalizeDateLabel(model.name), release_date: model.releaseDate },
        })),
        fallback: [],
      },
      eligible.length,
      STAGE_CONFIG.matcher,
    ).models[0]!;
    const match = result.best_match;
    if (!match) continue;
    const targets = eligible.filter((candidate) => candidate.version === match.model_id);
    // The main matcher ranks identities; history additionally requires one dated configuration, without a tie between releases.
    const competing = result.candidates.some(
      (candidate) => candidate.score === match.score && candidate.model_id !== match.model_id,
    );
    if (competing) continue;
    const targetSlugs = new Set(
      targets.flatMap(({ model }) => [...(index.artificialAnalysisVersions.get(model.id) ?? [])]),
    );
    if (targetSlugs.size > 1) continue;
    const target = targets[0]!;
    if (members.some((m) => m.current && m.id !== target.model.id) && target.model.current)
      continue;
    if (!joins.tryJoin(source.id, target.model.id)) continue;
    // Replaying a saved release can retain both the old label and its matched label for one exact API version.
    for (const candidate of targets) joins.tryJoin(target.model.id, candidate.model.id);
    joins.matched.add(source.id);
    joins.matched.add(target.model.id);
  }
}

function resolveGroups(
  joins: IdentityJoins,
  byId: ReadonlyMap<string, HistoricalModel>,
  frozenIds: ReadonlySet<string>,
  candidates: DatedVersion[],
): { models: HistoricalModel[]; aliases: Map<string, string> } {
  const aliases = new Map<string, string>();
  const resolved = new Map<string, HistoricalModel>();
  for (const members of joins.groups()) {
    const ordered = [...members].sort(
      (a, b) =>
        Number(frozenIds.has(b.id)) - Number(frozenIds.has(a.id)) ||
        Number(b.current) - Number(a.current) ||
        Number(b.releaseDate != null) - Number(a.releaseDate != null) ||
        Number(MONTH_YEAR_LABEL.test(b.name)) - Number(MONTH_YEAR_LABEL.test(a.name)) ||
        a.id.localeCompare(b.id),
    );
    const preferred = ordered[0]!;
    if (
      members.length === 1 ||
      !members.some((m) => joins.matched.has(m.id)) ||
      ordered.filter((m) => frozenIds.has(m.id) || m.current).length > 1
    ) {
      for (const model of members) resolved.set(model.id, model);
      continue;
    }
    const frozen = frozenIds.has(preferred.id) || preferred.current;
    const name = frozen ? preferred.name : normalizeDateLabel(preferred.name);
    const family = frozen ? preferred.family : canonicalModelKey({ name });
    const id = frozen ? preferred.id : `${family}::${preferred.effort ?? "unknown"}`;
    if (byId.has(id) && !joins.sameGroup(id, preferred.id)) {
      for (const model of members) resolved.set(model.id, model);
      continue;
    }
    const dates = candidates
      .filter(({ model }) => joins.sameGroup(model.id, preferred.id))
      .map(({ model, date }) => model.releaseDate ?? date);
    const releaseDate = frozen
      ? preferred.releaseDate
      : new Set(dates).size === 1
        ? dates[0]!
        : preferred.releaseDate;
    for (const model of members) aliases.set(model.id, id);
    resolved.set(id, { ...preferred, id, family, name, releaseDate });
  }
  return { models: [...resolved.values()], aliases };
}

/** Rewrite observations onto their resolved model, keeping the newest per model and benchmark; two same-time values that disagree throw. */
function mergeAliasedObservations(
  observations: HistoricalObservation[],
  aliases: ReadonlyMap<string, string>,
): HistoricalObservation[] {
  const selected = new Map<string, HistoricalObservation>();
  for (const originalObservation of observations) {
    const modelId = aliases.get(originalObservation.modelId) ?? originalObservation.modelId;
    const observation =
      modelId === originalObservation.modelId
        ? originalObservation
        : { ...originalObservation, modelId };
    const key = `${modelId}\0${observation.benchmarkId}`;
    const previous = selected.get(key);
    if (previous && previous.observedAt > observation.observedAt) continue;
    if (previous && previous.observedAt === observation.observedAt) {
      if (Math.abs(previous.value - observation.value) > 1e-9)
        throw new Error(
          `Conflicting matched observation for ${modelId} on ${observation.benchmarkId}.`,
        );
      // Identical measurements count once; the raw archives retain every source record.
      if (JSON.stringify(previous) <= JSON.stringify(observation)) continue;
    }
    selected.set(key, observation);
  }
  return [...selected.values()].sort(
    (a, b) => a.modelId.localeCompare(b.modelId) || a.benchmarkId.localeCompare(b.benchmarkId),
  );
}

/** Report identity problems in a dataset without changing it: duplicate model ids, measurements that are non-finite, duplicated, or on a missing model, release dates that contradict a month label, models an identity replay would alias away, and the same-provider, same-name, same-effort groups left unmerged with the reason. */
export function auditHistoricalIdentities(data: HistoricalDataset) {
  const versions = new Map<string, Set<string>>();
  const cells = new Set<string>();
  const errors: { kind: string; modelId: string; detail: string }[] = [];
  const modelIds = new Set<string>();
  for (const model of data.models) {
    if (modelIds.has(model.id))
      errors.push({ kind: "duplicate-model-id", modelId: model.id, detail: model.name });
    modelIds.add(model.id);
  }
  for (const observation of data.observations) {
    const key = `${observation.modelId}\0${observation.benchmarkId}`;
    if (!modelIds.has(observation.modelId))
      errors.push({
        kind: "missing-model",
        modelId: observation.modelId,
        detail: observation.benchmarkId,
      });
    if (!Number.isFinite(observation.value))
      errors.push({
        kind: "nonfinite-measurement",
        modelId: observation.modelId,
        detail: observation.benchmarkId,
      });
    if (cells.has(key))
      errors.push({
        kind: "duplicate-measurement",
        modelId: observation.modelId,
        detail: observation.benchmarkId,
      });
    cells.add(key);
    if (observation.sourceModelVersion) {
      const set = versions.get(observation.modelId) ?? new Set<string>();
      set.add(observation.sourceModelVersion);
      versions.set(observation.modelId, set);
    }
  }
  const groups = new Map<string, HistoricalModel[]>();
  for (const model of data.models) {
    if (model.releaseDate && !validHistoricalReleaseDate(model))
      errors.push({
        kind: "contradictory-release-date",
        modelId: model.id,
        detail: `${model.name}: ${model.releaseDate}`,
      });
    const key = `${providerIdentityKey(model.provider)}\0${historicalNameKey(model.name)}\0${model.effort}`;
    const group = groups.get(key) ?? [];
    group.push(model);
    groups.set(key, group);
  }
  const resolved = resolveHistoricalModelIdentities(data.models, data.observations);
  const resolvedIds = new Set(resolved.models.map((model) => model.id));
  for (const model of data.models) {
    if (!resolvedIds.has(model.id))
      errors.push({ kind: "unresolved-alias", modelId: model.id, detail: model.name });
  }
  if (resolved.observations.length !== data.observations.length)
    errors.push({
      kind: "unstable-observations",
      modelId: "",
      detail: "Identity replay changes the measurement count",
    });
  const reviewGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const dates = new Set(group.flatMap((model) => model.releaseDate ?? []));
      const reason = group.some((model) => !model.id.startsWith("name:"))
        ? "explicit-source-configurations"
        : dates.size > 1
          ? "different-or-conflicting-release-dates"
          : group.some((model) => (versions.get(model.id)?.size ?? 0) > 1)
            ? "multiple-source-versions"
            : "unconfirmed-identity";
      return {
        reason,
        models: group.map((model) => ({
          ...model,
          versions: [...(versions.get(model.id) ?? [])].sort(),
        })),
      };
    });
  return {
    models: data.models.length,
    observations: data.observations.length,
    errors,
    reviewGroups,
    undatedModels: data.models
      .filter((model) => !model.releaseDate)
      .map((model) => ({ id: model.id, name: model.name })),
  };
}

/** Preview spelling does not create another family when provider, remaining model identity and exact release date agree; configurations and observations stay separate. */
function reconcileFamilyLabels(
  models: HistoricalModel[],
  frozenIds: Set<string>,
): HistoricalModel[] {
  const groups = new Map<string, HistoricalModel[]>();
  for (const model of models) {
    if (!model.releaseDate) continue;
    const name = withoutMonthLabel(model.name.replace(/\bpreview\b/gi, ""));
    const key = `${providerIdentityKey(model.provider)}\0${shortVersionBase({ ...model, name }) ?? historicalNameKey(name)}\0${model.releaseDate}`;
    const group = groups.get(key) ?? [];
    group.push(model);
    groups.set(key, group);
  }
  const families = new Map<string, string>();
  for (const group of groups.values()) {
    if (
      new Set(group.map((m) => m.family)).size < 2 ||
      !group.some(
        (m) => /\bpreview\b/i.test(m.name) || MONTH_YEAR_LABEL.test(m.name) || shortVersionBase(m),
      )
    )
      continue;
    const preferred =
      group.find((m) => frozenIds.has(m.id) || m.current) ??
      group.find((m) => MONTH_YEAR_LABEL.test(m.name) && !/\bpreview\b/i.test(m.name)) ??
      group.find((m) => !/\bpreview\b/i.test(m.name)) ??
      group[0]!;
    for (const model of group) families.set(model.id, preferred.family);
  }
  return models.map((model) =>
    families.has(model.id) ? { ...model, family: families.get(model.id)! } : model,
  );
}

/** Drop a month-year label and the parentheses it leaves empty: `"Claude 3.5 Sonnet (Oct 2024)"` → `"Claude 3.5 Sonnet"`. */
function withoutMonthLabel(name: string): string {
  return name
    .replace(MONTH_YEAR_LABEL, "")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** Keep archived Artificial Analysis releases separate from a later current snapshot even when the source reused its generic name. */
function separateHistoricalReleases(
  models: HistoricalModel[],
  observations: HistoricalObservation[],
) {
  models = models.map((model) => {
    if (model.releaseDate) return model;
    const suffix = monthDaySuffix(model.name);
    if (!suffix) return model;
    const name = historicalNameKey(suffix.base);
    const dates = new Set(
      models.flatMap((peer) =>
        peer.releaseDate &&
        providerIdentityKey(peer.provider) === providerIdentityKey(model.provider) &&
        historicalNameKey(peer.name) === name &&
        suffix.fallsOn(peer.releaseDate)
          ? [peer.releaseDate]
          : [],
      ),
    );
    return dates.size === 1 ? { ...model, releaseDate: [...dates][0]! } : model;
  });
  const byId = new Map(models.map((model) => [model.id, model]));
  const datesByVersion = new Map<string, Set<string>>();
  const earlyDates = new Map<string, Set<string>>();
  const versionKey = (model: HistoricalModel, version: string) =>
    `${providerIdentityKey(model.provider)}\0${model.effort}\0${version}`;
  for (const observation of observations) {
    const model = byId.get(observation.modelId);
    if (!model || !isArtificialAnalysisObservation(observation)) continue;
    const date =
      observation.sourceReleaseDate ?? (shortVersionBase(model) ? model.releaseDate : null);
    if (!date || !Number.isFinite(Date.parse(date)) || date > observation.observedAt.slice(0, 10))
      continue;
    if (observation.sourceModelVersion) {
      const key = versionKey(model, observation.sourceModelVersion);
      const dates = datesByVersion.get(key) ?? new Set<string>();
      dates.add(date);
      datesByVersion.set(key, dates);
    }
    if (
      model.current &&
      model.releaseDate &&
      observation.observedAt.slice(0, 10) < model.releaseDate &&
      !isSameRelease(date, model.releaseDate)
    ) {
      const dates = earlyDates.get(model.id) ?? new Set<string>();
      dates.add(date);
      earlyDates.set(model.id, dates);
    }
  }
  observations = observations.map((observation) => {
    const model = byId.get(observation.modelId);
    if (!model || !earlyDates.has(model.id) || !isArtificialAnalysisObservation(observation))
      return observation;
    const candidates = observation.sourceModelVersion
      ? datesByVersion.get(versionKey(model, observation.sourceModelVersion))
      : null;
    const date =
      observation.sourceReleaseDate ?? (candidates?.size === 1 ? [...candidates][0] : null);
    if (!date || !earlyDates.get(model.id)!.has(date)) return observation;
    const name = historicalReleaseName(model.name, date);
    const family = canonicalModelKey({ name });
    const id = `${family}::${model.effort ?? "unknown"}`;
    byId.set(id, { ...model, id, family, name, releaseDate: date, current: false });
    return { ...observation, modelId: id };
  });
  return { models: [...byId.values()], observations };
}

/** A month/day suffix identifies a dated version only when it agrees with an independently known release date: `{ name: "Gemini 2.5 Pro 0605", releaseDate: "2025-06-05" }` → the name key of `"Gemini 2.5 Pro"`. */
function shortVersionBase(model: HistoricalModel): string | null {
  const suffix = monthDaySuffix(model.name);
  return suffix && model.releaseDate && suffix.fallsOn(model.releaseDate)
    ? historicalNameKey(suffix.base)
    : null;
}

/** A month/day suffix is a space or hyphen and four digits ending the name: `"Versioned Model 0731"` → base `"Versioned Model"`, and `fallsOn("2026-07-31")` is true. */
function monthDaySuffix(name: string) {
  const match = /[ -](\d{4})$/.exec(name);
  return match
    ? {
        base: name.slice(0, match.index),
        fallsOn: (date: string) => date.slice(5).replace("-", "") === match[1],
      }
    : null;
}

/** Require a single exact Artificial Analysis version, compatible dates and names, and agreement on overlapping measurements before reconciling an explicit source configuration. */
function exactArtificialAnalysisAliases(
  models: HistoricalModel[],
  observations: HistoricalObservation[],
) {
  const rows = new Map<string, HistoricalObservation[]>();
  for (const observation of observations) {
    const existing = rows.get(observation.modelId) ?? [];
    existing.push(observation);
    rows.set(observation.modelId, existing);
  }
  const groups = new Map<string, HistoricalModel[]>();
  for (const model of models) {
    const measured = rows.get(model.id) ?? [];
    const versions = new Set(measured.flatMap((o) => o.sourceModelVersion ?? []));
    if (
      versions.size !== 1 ||
      !model.releaseDate ||
      !measured.some(isArtificialAnalysisObservation)
    )
      continue;
    const key = `${providerIdentityKey(model.provider)}\0${model.effort}\0${[...versions][0]}\0${historicalNameKey(model.name)}\0${/with fallback/i.test(model.name)}`;
    const group = groups.get(key) ?? [];
    group.push(model);
    groups.set(key, group);
  }
  const aliases: [HistoricalModel, HistoricalModel][] = [];
  for (const members of groups.values()) {
    if (members.length < 2 || !members.some((m) => m.id.startsWith("aa-model:"))) continue;
    if (
      members.filter((m) => m.current || rows.get(m.id)!.some((o) => o.referenceConfidence != null))
        .length > 1
    )
      continue;
    if (members.some((a) => members.some((b) => !isSameRelease(a.releaseDate!, b.releaseDate!))))
      continue;
    const measurements = new Map<string, number>();
    let conflict = false;
    for (const model of members)
      for (const o of rows.get(model.id)!) {
        const key = `${o.benchmarkId}\0${o.observedAt}`;
        const previous = measurements.get(key);
        if (previous != null && Math.abs(previous - o.value) > 1e-9) conflict = true;
        measurements.set(key, o.value);
      }
    if (conflict) continue;
    const target = members[0]!;
    const version = rows.get(target.id)!.find((o) => o.sourceModelVersion)!.sourceModelVersion!;
    for (const source of members.slice(1)) {
      if (matchesVersion(source, target, version)) aliases.push([source, target]);
    }
  }
  return aliases;
}

/**
 * A source's evaluated release date replaces a conflicting month label without discarding the original label from observation provenance.
 * `("Gemini 2.5 Pro (Mar '25)", "2025-06-05")` → `"Gemini 2.5 Pro (Jun 2025)"`, and a name without a label gains one: `("DeepSeek R1", "2025-05-28")` → `"DeepSeek R1 (May 2025)"`.
 */
export function historicalReleaseName(name: string, date: string): string {
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return MONTH_YEAR_LABEL.test(name) ? name.replace(MONTH_YEAR_LABEL, label) : `${name} (${label})`;
}

function releasePeriod(model: HistoricalModel): string | null {
  if (model.releaseDate) return model.releaseDate;
  return releaseLabelPeriod(model.name);
}

/** The matcher's name identity key, which drops thinking and reasoning tags, plus whether the name carried one: `"Claude 3.7 Sonnet Thinking"` → `"claude-3-7-sonnet:thinking"`. */
export function historicalNameKey(name: string): string {
  const key = modelNameIdentityKey(name);
  return `${key}:${/\b(thinking|reasoning)\b/i.test(name) ? "thinking" : "base"}`;
}

/** Reject a date contradicting an explicit release-month label; an earlier consistent source date can still be retained. */
export function validHistoricalReleaseDate(model: HistoricalModel): string | null {
  if (!model.releaseDate) return null;
  const label = releasePeriod({ ...model, releaseDate: null });
  return !label || model.releaseDate.startsWith(label) ? model.releaseDate : null;
}

/** Group versions by canonical model, provider and effort; a generic record's launch date does not identify its evaluated snapshot. */
export function historicalVersionSeries(model: HistoricalModel): {
  key: string;
  period: string | null;
} {
  const period = releasePeriod({ ...model, releaseDate: null });
  const name = withoutMonthLabel(model.name);
  return {
    key: `${providerIdentityKey(model.provider)}|${historicalNameKey(name)}|${model.effort ?? "unknown"}`,
    period,
  };
}

function isArtificialAnalysisObservation(observation: HistoricalObservation): boolean {
  return observation.source.includes("artificialanalysis.ai/");
}
