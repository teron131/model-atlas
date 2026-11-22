/** The dashboard's regions and the charts a stacked region holds: their ids, labels, and order, shared by navigation, URL state, links, and headings, and how to find a region's element. */

export const RESEARCH_REGIONS = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "pareto", label: "Pareto" },
  { id: "timeline", label: "Timeline" },
] as const;

export type ResearchRegionId = (typeof RESEARCH_REGIONS)[number]["id"];

export const RESEARCH_REGION_IDS: readonly ResearchRegionId[] = RESEARCH_REGIONS.map(
  (region) => region.id,
);

/** The regions that stack several charts in one place, opening on the first, whose key is the region's own id; a link names the shown chart by its path, `/duels`. */
export const REGION_CHARTS = {
  leaderboard: [
    { key: "leaderboard", label: "Leaderboard" },
    { key: "spectra", label: "Spectra" },
    { key: "duels", label: "Duels" },
  ],
  pareto: [
    { key: "pareto", label: "Pareto" },
    { key: "effort", label: "Effort" },
  ],
} as const satisfies Partial<Record<ResearchRegionId, readonly { key: string; label: string }[]>>;

export type StackedRegionId = keyof typeof REGION_CHARTS;
export type RegionChartKey<Id extends StackedRegionId> = (typeof REGION_CHARTS)[Id][number]["key"];

export function isStackedRegion(id: ResearchRegionId): id is StackedRegionId {
  return Object.hasOwn(REGION_CHARTS, id);
}

export function researchRegionLabel(id: ResearchRegionId): string {
  const region = RESEARCH_REGIONS.find((candidate) => candidate.id === id);
  if (region == null) throw new Error(`Unknown research region ${id}`);
  return region.label;
}

/** A region's element, found by its region rather than its id, which a stacked region gives its shown chart. */
export function regionElement(id: ResearchRegionId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-region="${id}"]`);
}
