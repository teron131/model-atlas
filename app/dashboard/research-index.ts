/** Dashboard-wide section identities and order shared by navigation, URL state, links, and headings. */

export const RESEARCH_REGIONS = [
  { id: "leaderboard", label: "Models" },
  { id: "pareto-analysis", label: "Pareto" },
  { id: "timeline", label: "Timeline" },
] as const;

export type ResearchRegionId = (typeof RESEARCH_REGIONS)[number]["id"];

export const RESEARCH_REGION_IDS: readonly ResearchRegionId[] = RESEARCH_REGIONS.map(
  (region) => region.id,
);

export function researchRegionLabel(id: ResearchRegionId): string {
  const region = RESEARCH_REGIONS.find((candidate) => candidate.id === id);
  if (region == null) throw new Error(`Unknown research region ${id}`);
  return region.label;
}
