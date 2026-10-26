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

/** A region's name and its display position, one-based and zero-padded to two digits. */
export function researchRegion(id: ResearchRegionId): { label: string; ordinal: string } {
  const position = RESEARCH_REGION_IDS.indexOf(id);
  const region = RESEARCH_REGIONS[position];
  if (region == null) throw new Error(`Unknown research region ${id}`);
  return { label: region.label, ordinal: String(position + 1).padStart(2, "0") };
}
