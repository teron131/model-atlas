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
