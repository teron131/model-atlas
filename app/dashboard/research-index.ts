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

/** Return the one-based, zero-padded display position of a research region. */
export function researchRegionOrdinal(sectionId: ResearchRegionId): string {
  return String(RESEARCH_REGION_IDS.indexOf(sectionId) + 1).padStart(2, "0");
}
