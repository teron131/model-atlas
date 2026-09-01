/** Shared order for the sticky research index and its section headings. */

export const RESEARCH_REGIONS = [
  { id: "leaderboard", label: "Models" },
  { id: "pareto-analysis", label: "Pareto" },
  { id: "price-efficiency", label: "Price" },
] as const;

export type ResearchRegionId = (typeof RESEARCH_REGIONS)[number]["id"];

export const RESEARCH_REGION_IDS: readonly ResearchRegionId[] = RESEARCH_REGIONS.map(
  (region) => region.id,
);

/** Return the one-based, zero-padded display position of a research region. */
export function researchRegionOrdinal(sectionId: ResearchRegionId): string {
  return String(RESEARCH_REGION_IDS.indexOf(sectionId) + 1).padStart(2, "0");
}
