/** Verify measured label bounds, dense-family readability, and deterministic chart placement. */

import assert from "node:assert/strict";

import { calloutLabelPlacements } from "../app/dashboard/graphs/plot/label-placement";

const labels = [
  { key: "low", label: "Low", cx: 25, cy: 130, radius: 5 },
  { key: "medium", label: "Medium", cx: 90, cy: 65, radius: 5 },
  { key: "high", label: "High", cx: 140, cy: 62, radius: 5 },
  { key: "xhigh", label: "Xhigh", cx: 195, cy: 59, radius: 5 },
  { key: "max", label: "Max", cx: 250, cy: 56, radius: 5 },
].map((label, index) => ({
  ...label,
  size: { width: label.label.length * 8, ascent: 12, descent: 4 },
  priority: 5 - index,
}));
const bounds = { left: 0, right: 280, top: 0, bottom: 170 };
const inputs = {
  labels,
  obstacles: labels,
  bounds,
  segments: labels.slice(1).map((label, index) => ({
    x1: labels[index]!.cx,
    y1: labels[index]!.cy,
    x2: label.cx,
    y2: label.cy,
  })),
};
const positions = calloutLabelPlacements(inputs);
assert.deepEqual(
  positions,
  calloutLabelPlacements(inputs),
  "Identical hover-family states must retain the same label positions",
);
const boxes = labels.map((label) => {
  const position = positions.get(label.key)!;
  assert.ok(position, "Every highlighted variant must retain its label");
  const box = {
    left: position.x,
    right: position.x + label.size.width,
    top: position.y - label.size.ascent,
    bottom: position.y + label.size.descent,
  };
  assert.ok(
    box.left >= bounds.left &&
      box.right <= bounds.right &&
      box.top >= bounds.top &&
      box.bottom <= bounds.bottom,
    "Measured text must stay inside the chart",
  );
  return box;
});
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!,
      b = boxes[j]!;
    assert.ok(
      a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
      "Readable family labels must not overlap",
    );
  }
}
const adjacent = calloutLabelPlacements({ labels: [labels[2]!], obstacles: [labels[2]!], bounds });
assert.equal(
  adjacent.get("high")?.line,
  undefined,
  "An immediately adjacent label should not need a leader",
);

// The lower-left callout previously routed through the upper-left model's marker.
const crowded = (
  [
    [94, 82],
    [165, 103],
    [197, 141],
    [97, 128],
  ] as const
).map(([cx, cy], index) => ({
  key: String(index),
  label: `Model variant ${index}`,
  cx,
  cy,
  radius: 6,
  size: { width: 140, ascent: 14, descent: 4 },
}));
const routed = calloutLabelPlacements({
  labels: crowded,
  obstacles: crowded,
  bounds: { left: 0, right: 450, top: 0, bottom: 260 },
});
for (const label of crowded) {
  const line = routed.get(label.key)?.line;
  if (!line) continue;
  for (const point of crowded.filter((point) => point.key !== label.key)) {
    const dx = line.x2 - line.x1,
      dy = line.y2 - line.y1;
    const projection = Math.max(
      0,
      Math.min(1, ((point.cx - line.x1) * dx + (point.cy - line.y1) * dy) / (dx * dx + dy * dy)),
    );
    const distance = Math.hypot(
      point.cx - line.x1 - projection * dx,
      point.cy - line.y1 - projection * dy,
    );
    assert.ok(
      distance >= point.radius + 5,
      "A leader must leave clearance around an unrelated model's marker",
    );
  }
}

// Full names in this cluster previously caused a leader to run through another label.
const fullNames = (
  [
    [97, 107],
    [174, 128],
    [52, 104],
    [56, 67],
    [170, 127],
  ] as const
).map(([cx, cy], index) => ({
  key: String(index),
  label: `Full model name ${index}`,
  cx,
  cy,
  radius: 7,
  size: { width: 180, ascent: 14, descent: 4 },
}));
const fullPlacements = calloutLabelPlacements({
  labels: fullNames,
  obstacles: fullNames,
  bounds: { left: 0, right: 500, top: 0, bottom: 300 },
});
for (const owner of fullNames) {
  const line = fullPlacements.get(owner.key)?.line;
  if (!line) continue;
  for (const other of fullNames.filter((label) => label.key !== owner.key)) {
    const box = fullPlacements.get(other.key)!;
    let enter = 0,
      leave = 1;
    for (const [origin, delta, min, max] of [
      [line.x1, line.x2 - line.x1, box.x - 3, box.x + other.size.width + 3],
      [line.y1, line.y2 - line.y1, box.y - other.size.ascent - 3, box.y + other.size.descent + 3],
    ] as const) {
      if (Math.abs(delta) < 1e-8) {
        if (origin < min || origin > max) {
          enter = 2;
          break;
        }
      } else {
        const a = (min - origin) / delta,
          b = (max - origin) / delta;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
    }
    assert.ok(enter > leave, "Full-name callouts must not route a leader through another label");
  }
}

// Corner captions reserve their full area, including against callout leaders.
const corner = { left: 0, right: 100, top: 0, bottom: 32 };
const cornerLabel = {
  key: "corner",
  label: "Top model",
  cx: 75,
  cy: 48,
  radius: 7,
  size: { width: 90, ascent: 12, descent: 4 },
};
const cornerPlacement = calloutLabelPlacements({
  bounds,
  labels: [cornerLabel],
  obstacles: [cornerLabel],
  reservedBoxes: [corner],
}).get("corner")!;
assert.ok(cornerPlacement);
assert.ok(cornerPlacement.x >= corner.right || cornerPlacement.y - 12 >= corner.bottom);
if (cornerPlacement.line) {
  const line = cornerPlacement.line;
  for (let step = 0; step <= 100; step++) {
    const x = line.x1 + ((line.x2 - line.x1) * step) / 100;
    const y = line.y1 + ((line.y2 - line.y1) * step) / 100;
    assert.ok(x > corner.right || y > corner.bottom || x < corner.left || y < corner.top);
  }
}
