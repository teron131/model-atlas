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

export function fmtPercent(value: unknown, digits = 0) {
	const normalized = percent(value);
	return normalized == null ? "--" : `${normalized.toFixed(digits)}%`;
}

export function fmtScore(value: number | null | undefined) {
	return finite(value) ? value.toFixed(0) : "--";
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

export function fmtTooltipPercent(value: unknown) {
	const normalized = percent(value);
	return normalized == null ? "--" : `${normalized.toFixed(1)}%`;
}

export function fmtSeconds(value: number) {
	if (Number.isInteger(value)) {
		return `${value.toFixed(0)}s`;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)}s`;
}

export function fmtMinutes(seconds: number | null | undefined) {
	if (!finite(seconds)) {
		return "--";
	}
	return `${(seconds / 60).toFixed(seconds > 600 ? 0 : 1)}m`;
}

export function fmtDurationShort(seconds: number) {
	if (seconds >= 172_800) {
		return `${Number((seconds / 86_400).toFixed(seconds >= 864_000 ? 0 : 1))}d`;
	}
	if (seconds >= 7_200) {
		return `${Number((seconds / 3_600).toFixed(seconds >= 36_000 ? 0 : 1))}h`;
	}
	return `${fmtCompact(seconds)}s`;
}
