/** Explicit score annotations shared by Markdown rendering, navigation labels, and plain-text heading or accessibility output. */

export type ScoreName = "Intelligence" | "Agentic" | "Speed" | "Value";

const SCORE_MARKER = /:score\[(Intelligence|Agentic|Speed|Value)\]/g;

/** Only author-supplied markers opt into score styling; ordinary words never become score labels. */
export function scoreMarkers(text: string): { index: number; end: number; score: ScoreName }[] {
  return [...text.matchAll(SCORE_MARKER)].map((match) => ({
    index: match.index,
    end: match.index + match[0].length,
    score: match[1] as ScoreName,
  }));
}

/** Keep source annotations out of heading anchors, image alternatives, and other plain-text metadata. */
export function plainScoreText(text: string): string {
  return text.replaceAll(SCORE_MARKER, "$1");
}

/** Convert explicit markers in rendered Markdown text without changing code, equations, links, or emphasis. */
export function scoreMentions() {
  type Node = {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, string>;
    children?: Node[];
  };
  function visit(node: Node) {
    if (node.children == null || node.tagName === "code" || node.tagName === "pre") return;
    node.children = node.children.flatMap((child): Node[] => {
      if (child.type !== "text" || child.value == null) {
        visit(child);
        return [child];
      }
      const parts: Node[] = [];
      let offset = 0;
      for (const { index, end, score } of scoreMarkers(child.value)) {
        if (index > offset) parts.push({ type: "text", value: child.value.slice(offset, index) });
        parts.push({
          type: "element",
          tagName: "span",
          properties: { "data-score": score },
          children: [{ type: "text", value: score }],
        });
        offset = end;
      }
      if (offset === 0) return [child];
      if (offset < child.value.length)
        parts.push({ type: "text", value: child.value.slice(offset) });
      return parts;
    });
  }
  return visit;
}
