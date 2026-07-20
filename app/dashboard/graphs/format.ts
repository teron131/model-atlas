/** Number formatting helpers for graph labels and hover details. */

export function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function finiteValue(value: unknown): number | null {
	return finite(value) ? value : null;
}

const tooltipIntegerFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
});

const tooltipDecimalFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
});

export function percent(value: unknown) {
	if (!finite(value)) {
		return null;
	}
	return value <= 1 ? value * 100 : value;
}

export function fmtPercentScore(value: unknown) {
	if (!finite(value)) {
		return "--";
	}
	// Benchmark sources report score percentages at roughly tenth-point precision.
	const roundedToTenth = Number(value.toFixed(1));
	if (value < 100 && roundedToTenth >= 100) {
		return "99.9%";
	}
	const roundedToWhole = Math.round(roundedToTenth);
	return Math.abs(roundedToTenth - roundedToWhole) < 0.001
		? `${roundedToWhole}%`
		: `${roundedToTenth.toFixed(1)}%`;
}

export function fmtTooltipScore(value: number | null | undefined) {
	return finite(value) ? value.toFixed(1) : "--";
}

export function fmtMoney(value: number | null | undefined) {
	if (!finite(value)) {
		return "--";
	}
	if (value < 1) {
		return `$${value.toFixed(2)}`;
	}
	if (value < 10) {
		return `$${value.toFixed(1)}`;
	}
	return `$${value.toFixed(0)}`;
}

export function fmtTooltipMoney(value: number | null | undefined) {
	if (!finite(value)) {
		return "--";
	}
	return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

export function fmtCompact(value: number | null | undefined) {
	if (!finite(value)) {
		return "--";
	}
	if (Math.abs(value) >= 1_000_000) {
		return `${Number((value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1))}M`;
	}
	if (Math.abs(value) >= 1_000) {
		return `${Number((value / 1_000).toFixed(value >= 10_000 ? 0 : 1))}K`;
	}
	if (Number.isInteger(value)) {
		return String(value);
	}
	return value.toFixed(value >= 10 ? 0 : 1);
}

export function fmtTooltipNumber(value: number | null | undefined) {
	if (!finite(value)) {
		return "--";
	}
	return Number.isInteger(value)
		? tooltipIntegerFormatter.format(value)
		: tooltipDecimalFormatter.format(value);
}

export function fmtSeconds(value: number) {
	if (Number.isInteger(value)) {
		return `${value.toFixed(0)}s`;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)}s`;
}

export function fmtDurationShort(seconds: number) {
	if (seconds >= 172_800) {
		return `${Number((seconds / 86_400).toFixed(seconds >= 864_000 ? 0 : 1))}d`;
	}
	if (seconds >= 7_200) {
		return `${Number((seconds / 3_600).toFixed(seconds >= 36_000 ? 0 : 1))}h`;
	}
	return fmtSeconds(seconds);
}
