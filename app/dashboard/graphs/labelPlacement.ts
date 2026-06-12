import { clamp } from "../../../src/model-atlas/math-utils";

const LABEL_DIRECTIONS = [
	0, -30, 30, -60, 60, -90, 90, 180, -150, 150, -120, 120, -45, 45, -135, 135,
].map((degree) => (degree * Math.PI) / 180);
const LABEL_DISTANCE_STEPS = [8, 22, 42, 66, 94];

type TextAnchor = "start" | "middle" | "end";

type LabelBox = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

type LabelPlacementBounds = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

export type PointLabelPlacement = {
	x: number;
	y: number;
	textAnchor: TextAnchor;
	line?: {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	};
};

export type PointLabelAnchor = {
	key: string;
	label: string;
	cx: number;
	cy: number;
	radius: number;
	priority?: number;
};

type PointObstacle = {
	cx: number;
	cy: number;
	radius: number;
};

function labelBox({
	x,
	y,
	textAnchor,
	textWidth,
	fontSize,
	lineHeight,
	padding,
}: {
	x: number;
	y: number;
	textAnchor: TextAnchor;
	textWidth: number;
	fontSize: number;
	lineHeight: number;
	padding: number;
}): LabelBox {
	const left =
		textAnchor === "end"
			? x - textWidth - padding
			: textAnchor === "middle"
				? x - textWidth / 2 - padding
				: x - padding;
	return {
		left,
		right: left + textWidth + padding * 2,
		top: y - fontSize - padding,
		bottom: y + (lineHeight - fontSize) + padding,
	};
}

function fitLabelBox({
	box,
	x,
	y,
	bounds,
}: {
	box: LabelBox;
	x: number;
	y: number;
	bounds: LabelPlacementBounds;
}) {
	const dx =
		box.left < bounds.left
			? bounds.left - box.left
			: box.right > bounds.right
				? bounds.right - box.right
				: 0;
	const dy =
		box.top < bounds.top
			? bounds.top - box.top
			: box.bottom > bounds.bottom
				? bounds.bottom - box.bottom
				: 0;
	return {
		x: x + dx,
		y: y + dy,
		box: {
			left: box.left + dx,
			right: box.right + dx,
			top: box.top + dy,
			bottom: box.bottom + dy,
		},
		shift: Math.abs(dx) + Math.abs(dy),
	};
}

function boxOverlapArea(left: LabelBox, right: LabelBox) {
	const width = Math.max(
		0,
		Math.min(left.right, right.right) - Math.max(left.left, right.left),
	);
	const height = Math.max(
		0,
		Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
	);
	return width * height;
}

function pointLabelPenalty(
	box: LabelBox,
	point: PointObstacle,
	padding: number,
) {
	const nearestX = clamp(point.cx, box.left, box.right);
	const nearestY = clamp(point.cy, box.top, box.bottom);
	const dx = point.cx - nearestX;
	const dy = point.cy - nearestY;
	const gap = Math.sqrt(dx * dx + dy * dy);
	const minGap = point.radius + padding;
	if (gap >= minGap) {
		return 0;
	}
	const overlap = minGap - gap;
	return 900 + overlap * overlap * 16;
}

function leaderLineFor({
	cx,
	cy,
	radius,
	box,
	padding,
}: {
	cx: number;
	cy: number;
	radius: number;
	box: LabelBox;
	padding: number;
}): PointLabelPlacement["line"] {
	const lineBox = {
		left: box.left + padding,
		right: box.right - padding,
		top: box.top + padding,
		bottom: box.bottom - padding,
	};
	const x2 = clamp(cx, lineBox.left, lineBox.right);
	const y2 = clamp(cy, lineBox.top, lineBox.bottom);
	const dx = x2 - cx;
	const dy = y2 - cy;
	const distance = Math.sqrt(dx * dx + dy * dy);
	if (distance < 1) {
		return undefined;
	}
	const scale = Math.min((radius + 2) / distance, 0.72);
	return {
		x1: cx + dx * scale,
		y1: cy + dy * scale,
		x2,
		y2,
	};
}

export function calloutLabelPlacements({
	labels,
	obstacles,
	bounds,
	fontSize = 12,
	charWidth = 7.2,
	lineHeight = 14,
	padding = 4,
}: {
	labels: PointLabelAnchor[];
	obstacles: PointObstacle[];
	bounds: LabelPlacementBounds;
	fontSize?: number;
	charWidth?: number;
	lineHeight?: number;
	padding?: number;
}) {
	const labelBounds = {
		left: bounds.left + padding,
		right: bounds.right - padding,
		top: bounds.top + padding,
		bottom: bounds.bottom - padding,
	};
	const placedBoxes: LabelBox[] = [];
	const placements = new Map<string, PointLabelPlacement>();
	const orderedLabels = labels
		.map((label, order) => ({ ...label, order }))
		.sort(
			(left, right) =>
				(right.priority ?? 0) - (left.priority ?? 0) ||
				left.order - right.order,
		);

	for (const label of orderedLabels) {
		const textWidth = Math.max(18, label.label.length * charWidth);
		let best:
			| {
					x: number;
					y: number;
					textAnchor: TextAnchor;
					box: LabelBox;
					score: number;
			  }
			| undefined;

		for (const angle of LABEL_DIRECTIONS) {
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const textAnchor: TextAnchor =
				cos < -0.35 ? "end" : cos > 0.35 ? "start" : "middle";
			const preferredSide =
				label.cx > (bounds.left + bounds.right) / 2 ? "end" : "start";

			for (const step of LABEL_DISTANCE_STEPS) {
				const distance = label.radius + step + Math.min(28, textWidth * 0.1);
				const candidateX = label.cx + cos * distance;
				const candidateY = label.cy + sin * distance + fontSize / 2 - 2;
				const rawBox = labelBox({
					x: candidateX,
					y: candidateY,
					textAnchor,
					textWidth,
					fontSize,
					lineHeight,
					padding,
				});
				const fitted = fitLabelBox({
					box: rawBox,
					x: candidateX,
					y: candidateY,
					bounds: labelBounds,
				});

				let score =
					distance * 0.08 +
					fitted.shift * 36 +
					(textAnchor === preferredSide ? 0 : 8) +
					Math.abs(sin) * 1.5;
				for (const point of obstacles) {
					score += pointLabelPenalty(fitted.box, point, padding + 3);
				}
				for (const placedBox of placedBoxes) {
					const overlap = boxOverlapArea(fitted.box, placedBox);
					score += overlap * 34 + (overlap > 0 ? 650 : 0);
				}

				if (!best || score < best.score) {
					best = {
						x: fitted.x,
						y: fitted.y,
						textAnchor,
						box: fitted.box,
						score,
					};
				}
			}
		}

		if (best) {
			placedBoxes.push(best.box);
			placements.set(label.key, {
				x: best.x,
				y: best.y,
				textAnchor: best.textAnchor,
				line: leaderLineFor({
					cx: label.cx,
					cy: label.cy,
					radius: label.radius,
					box: best.box,
					padding,
				}),
			});
		}
	}

	return placements;
}
