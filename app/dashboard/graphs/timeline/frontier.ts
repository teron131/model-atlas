/** Require evidence support for every record, independently of release age or current portfolio membership. */
export const TIMELINE_START_DATE = "2023-03-14";

type Candidate = {
  score: number;
  coverage: number | null;
  releaseDate: string | null;
  estimate?: { value?: number | null };
};

/** Coverage is prepared against retained evidence before view filters; neither age nor unknown support bypasses the cutoff. */
export function coverageFrontier<T extends Candidate>(ordered: T[], minimumCoverage: number): T[] {
  const eligible = ordered.filter(
    (point) => point.coverage != null && point.coverage >= minimumCoverage,
  );
  let best = -Infinity;
  return [...eligible]
    .sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") || b.score - a.score)
    .filter((point) => {
      if (point.score <= best) return false;
      best = point.score;
      return true;
    });
}

export type LabFrontier<T extends Candidate & { id: string; provider: string }> = {
  provider: string;
  models: T[];
  records: T[];
};

/** Rank eligible labs by their highest supported index, before viewport changes; count distinct charted models rather than frontier records. */
export function leadingLabs<T extends Candidate & { id: string; provider: string }>(
  points: T[],
): LabFrontier<T>[] {
  const groups = new Map<string, Map<string, T>>();
  for (const point of points) {
    const models = groups.get(point.provider) ?? new Map<string, T>();
    models.set(point.id, point);
    groups.set(point.provider, models);
  }
  return [...groups]
    .flatMap(([provider, group]) => {
      const models = [...group.values()];
      if (models.length <= 5) return [];
      const records = coverageFrontier(models, 0.6);
      return records.length ? [{ provider, models, records }] : [];
    })
    .sort(
      (a, b) =>
        b.records.at(-1)!.score - a.records.at(-1)!.score || a.provider.localeCompare(b.provider),
    )
    .slice(0, 10);
}
