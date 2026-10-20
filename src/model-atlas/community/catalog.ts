/** Community index definitions own their identity, Intelligence influence, and presentation in table order. */

export const COMMUNITY_INDEXES = [
  {
    key: "tmb",
    columnKey: "tmbIndex",
    label: "TMB",
    title: "Trust Me Bro Index",
    description:
      "Overall practical capability, judged from people's substantive work with these models.",
    weight: 0.75,
  },
  {
    key: "slop",
    columnKey: "slopIndex",
    label: "Slop",
    title: "Slop Index",
    description:
      "Quality of websites, interfaces, and 2D or 3D visual work created by these models, including design and coherent behavior.",
    weight: 0.25,
  },
] as const;

export type CommunityIndex = (typeof COMMUNITY_INDEXES)[number];
export type CommunityIndexKey = CommunityIndex["key"];
export type CommunityIndexPlace = { best: number; worst: number };

export function communityPlaceLabel(place: CommunityIndexPlace): string {
  return place.best === place.worst ? `#${place.best}` : `#${place.best}–${place.worst}`;
}
