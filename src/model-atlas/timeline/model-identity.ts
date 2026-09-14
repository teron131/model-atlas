/** Match retained publisher records with the main identity matcher before joining observations; release dates and effort constrain historical candidates. */
import { STAGE_CONFIG } from "../config";
import { modelNameIdentityKey } from "../identity";
import { runMatcher } from "../identity/matching/pipeline";
import { canonicalModelKey, normalizeModelToken } from "../identity/normalization";
import { providerIdentityKey } from "../identity/provider";
import {
  DATE_LABEL,
  normalizedDateLabel,
  releaseLabelPeriod,
  sameRelease,
  versionDate,
} from "../identity/releases";
import type { HistoricalModel, HistoricalObservation } from "./types";

/** Reconcile AA publisher slugs against retained dated API versions, never against a filtered or current-only catalog. */
export function resolveHistoricalModelIdentities(
  models: HistoricalModel[],
  observations: HistoricalObservation[],
): { models: HistoricalModel[]; observations: HistoricalObservation[] } {
  ({ models, observations } = separateHistoricalReleases(models, observations));
  models = models
    .map((model) => ({ ...model, releaseDate: validHistoricalReleaseDate(model) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(models.map((model) => [model.id, model]));
  const releaseDates = new Map<string, Set<string>>();
  for (const observation of observations) {
    const model = byId.get(observation.modelId);
    const date = observation.sourceModelVersion
      ? versionDate(observation.sourceModelVersion)
      : null;
    // A dated version and the source model's release metadata must corroborate each other before correcting an earlier effort label.
    if (!model || !date || date !== model.releaseDate) continue;
    const key = `${providerIdentityKey(model.provider)}\0${model.family}`;
    const dates = releaseDates.get(key) ?? new Set<string>();
    dates.add(date);
    releaseDates.set(key, dates);
  }
  models = models.map((model) => {
    const dates = releaseDates.get(`${providerIdentityKey(model.provider)}\0${model.family}`);
    const date = dates?.size === 1 ? [...dates][0] : null;
    return model.effort != null && date && model.releaseDate && model.releaseDate < date
      ? { ...model, releaseDate: date }
      : model;
  });
  const original = new Map(models.map((model) => [model.id, model]));
  const frozenIds = new Set(
    observations.filter((o) => o.referenceConfidence != null).map((o) => o.modelId),
  );
  const parent = new Map(models.map((model) => [model.id, model.id]));
  const root = (id: string): string => {
    const next = parent.get(id)!;
    return next === id ? id : root(next);
  };
  const join = (left: string, right: string) => {
    const a = root(left),
      b = root(right);
    if (a === b) return true;
    const measurements = new Map<string, HistoricalObservation>();
    for (const observation of observations) {
      const group = root(observation.modelId);
      if (group !== a && group !== b) continue;
      const key = `${observation.benchmarkId}\0${observation.observedAt}`;
      const previous = measurements.get(key);
      if (
        previous &&
        (Math.abs(previous.value - observation.value) > 1e-9 ||
          (previous.source.includes("artificialanalysis.ai/") &&
            previous.sourceModelVersion !== observation.sourceModelVersion))
      )
        return false;
      measurements.set(key, observation);
    }
    parent.set(a < b ? b : a, a < b ? a : b);
    return true;
  };
  const publisherGroups = new Map<string, { version: string; ids: Set<string> }>();
  const matchedIds = new Set<string>();
  const publisherVersions = new Map<string, Set<string>>();
  const measuredVersions = new Map<string, Set<string>>();
  const datedVersions = new Map<
    string,
    { model: HistoricalModel; version: string; date: string }
  >();
  for (const observation of observations) {
    const model = original.get(observation.modelId);
    const version = observation.sourceModelVersion;
    // Disambiguated source configurations cannot be collapsed by a base-model matcher.
    if (!model?.id.startsWith("name:") || !version) continue;
    const date =
      versionDate(version) ??
      (!observation.source.includes("artificialanalysis.ai/")
        ? validHistoricalReleaseDate(model)
        : null);
    if (date) datedVersions.set(`${model.id}\0${version}`, { model, version, date });
    if (!observation.source.includes("artificialanalysis.ai/")) {
      const versions = measuredVersions.get(model.id) ?? new Set<string>();
      versions.add(version);
      measuredVersions.set(model.id, versions);
      continue;
    }
    const versions = publisherVersions.get(model.id) ?? new Set<string>();
    versions.add(version);
    publisherVersions.set(model.id, versions);
    const key = `${providerIdentityKey(model.provider)}\0${model.effort}\0${version}\0${/with fallback/i.test(model.name)}`;
    const group = publisherGroups.get(key) ?? { version, ids: new Set<string>() };
    group.ids.add(model.id);
    publisherGroups.set(key, group);
  }
  // Frozen catalog names still identify models even when their checkpoint did not retain external source slugs.
  const nameOnlyReferences = new Set<string>();
  for (const model of models) {
    if (
      !frozenIds.has(model.id) ||
      !model.releaseDate ||
      publisherVersions.has(model.id) ||
      measuredVersions.has(model.id)
    )
      continue;
    nameOnlyReferences.add(model.id);
    const version = normalizeModelToken(normalizedDateLabel(model.name));
    datedVersions.set(`${model.id}\0${version}`, { model, version, date: model.releaseDate });
  }
  // A publisher's stable slug joins shortened labels before cross-source matching.
  for (const [key, { ids }] of publisherGroups) {
    for (const id of ids)
      if (publisherVersions.get(id)!.size > 1 || (measuredVersions.get(id)?.size ?? 0) > 1)
        ids.delete(id);
    if (!ids.size) {
      publisherGroups.delete(key);
      continue;
    }
    const members = [...ids].map((id) => original.get(id)!);
    const periods = members.flatMap((m) => releasePeriod(m) ?? []);
    if (periods.some((a) => periods.some((b) => !sameRelease(a, b)))) {
      // Reused slugs remain separate by known release; an undated member cannot choose between generations.
      publisherGroups.delete(key);
      for (const period of new Set(periods)) {
        const datedIds = new Set(
          members.filter((model) => releasePeriod(model) === period).map((model) => model.id),
        );
        publisherGroups.set(`${key}\0${period}`, {
          version: publisherVersions
            .get([...datedIds][0]!)!
            .values()
            .next().value!,
          ids: datedIds,
        });
      }
      continue;
    }
    for (const id of ids) join([...ids][0]!, id);
    const dated = members.find((m) => m.releaseDate);
    if (members.length > 1 && dated) {
      const version = publisherGroups.get(key)!.version;
      const exact = runMatcher(
        [
          {
            sourceId: dated.id,
            sourceSlug: version,
            sourceName: dated.name,
            sourceProvider: dated.provider,
            sourceReleaseDate: dated.releaseDate,
          },
        ],
        {
          primary: [
            {
              provider_id: dated.provider,
              provider_name: dated.provider,
              model_id: version,
              model: { name: dated.name, release_date: dated.releaseDate },
            },
          ],
          fallback: [],
        },
        1,
        STAGE_CONFIG.matcher,
      ).models[0]!.best_match;
      if (exact) matchedIds.add(dated.id);
    }
  }
  const datesByModel = new Map<string, Set<string>>();
  for (const { model, date } of datedVersions.values()) {
    const dates = datesByModel.get(model.id) ?? new Set<string>();
    dates.add(date);
    datesByModel.set(model.id, dates);
  }
  const candidates = [...datedVersions.values()]
    .filter(
      ({ model }) =>
        datesByModel.get(model.id)!.size === 1 &&
        (publisherVersions.get(model.id)?.size ?? 0) <= 1 &&
        (measuredVersions.get(model.id)?.size ?? 0) <= 1,
    )
    .sort((a, b) => a.model.id.localeCompare(b.model.id) || a.version.localeCompare(b.version));
  for (const [, { version, ids }] of [...publisherGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const groupRoot = root([...ids][0]!);
    const members = models.filter((m) => root(m.id) === groupRoot);
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
        sameRelease(period, model.releaseDate ?? date),
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
            ? normalizeModelToken(normalizedDateLabel(source.name))
            : undefined,
        },
      ],
      {
        primary: eligible.map(({ model, version: candidateVersion }) => ({
          provider_id: model.provider,
          provider_name: model.provider,
          model_id: candidateVersion,
          model: { name: normalizedDateLabel(model.name), release_date: model.releaseDate },
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
      targets.flatMap(({ model }) => [...(publisherVersions.get(model.id) ?? [])]),
    );
    if (targetSlugs.size > 1) continue;
    const target = targets[0]!;
    if (members.some((m) => m.current && m.id !== target.model.id) && target.model.current)
      continue;
    if (!join(source.id, target.model.id)) continue;
    // Replaying a saved release can retain both the old label and its matched label for one exact API version.
    for (const candidate of targets) join(target.model.id, candidate.model.id);
    matchedIds.add(source.id);
    matchedIds.add(target.model.id);
  }
  // Explicit source IDs protect configurations from fuzzy matching, but must not duplicate an exact, independently compatible publisher identity.
  for (const [source, target] of exactPublisherAliases(models, observations)) {
    join(source.id, target.id);
    matchedIds.add(source.id);
    matchedIds.add(target.id);
  }
  const groups = new Map<string, HistoricalModel[]>();
  for (const model of models) {
    const id = root(model.id);
    const group = groups.get(id) ?? [];
    group.push(model);
    groups.set(id, group);
  }
  const aliases = new Map<string, string>();
  const resolved = new Map<string, HistoricalModel>();
  for (const members of groups.values()) {
    const ordered = [...members].sort(
      (a, b) =>
        Number(frozenIds.has(b.id)) - Number(frozenIds.has(a.id)) ||
        Number(b.current) - Number(a.current) ||
        Number(b.releaseDate != null) - Number(a.releaseDate != null) ||
        Number(DATE_LABEL.test(b.name)) - Number(DATE_LABEL.test(a.name)) ||
        a.id.localeCompare(b.id),
    );
    const preferred = ordered[0]!;
    if (
      members.length === 1 ||
      !members.some((m) => matchedIds.has(m.id)) ||
      ordered.filter((m) => frozenIds.has(m.id) || m.current).length > 1
    ) {
      for (const model of members) resolved.set(model.id, model);
      continue;
    }
    const frozen = frozenIds.has(preferred.id) || preferred.current;
    const name = frozen ? preferred.name : normalizedDateLabel(preferred.name);
    const family = frozen ? preferred.family : canonicalModelKey({ name });
    const id = frozen ? preferred.id : `${family}::${preferred.effort ?? "unknown"}`;
    if (original.has(id) && root(id) !== root(preferred.id)) {
      for (const model of members) resolved.set(model.id, model);
      continue;
    }
    const dates = candidates
      .filter(({ model }) => root(model.id) === root(preferred.id))
      .map(({ model, date }) => model.releaseDate ?? date);
    const releaseDate = frozen
      ? preferred.releaseDate
      : new Set(dates).size === 1
        ? dates[0]!
        : preferred.releaseDate;
    for (const model of members) aliases.set(model.id, id);
    resolved.set(id, { ...preferred, id, family, name, releaseDate });
  }
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
  return {
    models: reconcileFamilyLabels([...resolved.values()], frozenIds).sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    observations: [...selected.values()].sort(
      (a, b) => a.modelId.localeCompare(b.modelId) || a.benchmarkId.localeCompare(b.benchmarkId),
    ),
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
    const name = model.name
      .replace(/\bpreview\b/gi, "")
      .replace(DATE_LABEL, "")
      .replace(/\(\s*\)/g, "")
      .trim();
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
        (m) => /\bpreview\b/i.test(m.name) || DATE_LABEL.test(m.name) || shortVersionBase(m),
      )
    )
      continue;
    const preferred =
      group.find((m) => frozenIds.has(m.id) || m.current) ??
      group.find((m) => DATE_LABEL.test(m.name) && !/\bpreview\b/i.test(m.name)) ??
      group.find((m) => !/\bpreview\b/i.test(m.name)) ??
      group[0]!;
    for (const model of group) families.set(model.id, preferred.family);
  }
  return models.map((model) =>
    families.has(model.id) ? { ...model, family: families.get(model.id)! } : model,
  );
}

/** Keep archived publisher releases separate from a later current snapshot even when the source reused its generic name. */
function separateHistoricalReleases(
  models: HistoricalModel[],
  observations: HistoricalObservation[],
) {
  models = models.map((model) => {
    if (model.releaseDate) return model;
    const match = /[ -](\d{2})(\d{2})$/.exec(model.name);
    if (!match) return model;
    const name = historicalNameKey(model.name.slice(0, match.index));
    const dates = new Set(
      models.flatMap((peer) =>
        peer.releaseDate &&
        providerIdentityKey(peer.provider) === providerIdentityKey(model.provider) &&
        historicalNameKey(peer.name) === name &&
        peer.releaseDate.slice(5).replace("-", "") === match[1]! + match[2]!
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
    if (!model || !observation.source.includes("artificialanalysis.ai/")) continue;
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
      !sameRelease(date, model.releaseDate)
    ) {
      const dates = earlyDates.get(model.id) ?? new Set<string>();
      dates.add(date);
      earlyDates.set(model.id, dates);
    }
  }
  observations = observations.map((observation) => {
    const model = byId.get(observation.modelId);
    if (
      !model ||
      !earlyDates.has(model.id) ||
      !observation.source.includes("artificialanalysis.ai/")
    )
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

/** A month/day suffix identifies a dated revision only when it agrees with an independently known release date. */
function shortVersionBase(model: HistoricalModel): string | null {
  const match = /[ -](\d{2})(\d{2})$/.exec(model.name);
  return match && model.releaseDate?.slice(5).replace("-", "") === match[1]! + match[2]!
    ? historicalNameKey(model.name.slice(0, match.index))
    : null;
}

/** Require a single exact publisher version, compatible dates and names, and agreement on overlapping measurements before reconciling an explicit source configuration. */
function exactPublisherAliases(models: HistoricalModel[], observations: HistoricalObservation[]) {
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
      !measured.some((o) => o.source.includes("artificialanalysis.ai/"))
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
    if (members.some((a) => members.some((b) => !sameRelease(a.releaseDate!, b.releaseDate!))))
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
          primary: [
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
      if (match?.model_id === version) aliases.push([source, target]);
    }
  }
  return aliases;
}

/** A source's evaluated release date replaces a conflicting month label without discarding the original label from observation provenance. */
export function historicalReleaseName(name: string, date: string): string {
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return DATE_LABEL.test(name) ? name.replace(DATE_LABEL, label) : `${name} (${label})`;
}

function releasePeriod(model: HistoricalModel): string | null {
  if (model.releaseDate) return model.releaseDate;
  return releaseLabelPeriod(model.name);
}

/** Keep spelling variants comparable while the main matcher owns model token identity. */
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
  const name = model.name
    .replace(DATE_LABEL, "")
    .replace(/\(\s*\)/g, "")
    .trim();
  return {
    key: `${providerIdentityKey(model.provider)}|${historicalNameKey(name)}|${model.effort ?? "unknown"}`,
    period,
  };
}
