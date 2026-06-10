import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { NextRequest } from "next/server";

import { publicCacheHeaders } from "../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const LOGO_ROOT = resolve(process.cwd(), ".cache/stats-logos");
const DARK_UI_MONOCHROME = "#eeeeea";
const HUE_BIN_DEGREES = 12;
const MIN_CHROMA_SHARE = 0.04;
const MAX_PROVIDER_COLOR_BATCH_SIZE = 64;
const PROVIDER_COLOR_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 3600,
	cdnMaxAgeSeconds: 86400,
	staleWhileRevalidateSeconds: 604800,
});

type ColorCache = Map<string, string | null>;

const globalColorCache = globalThis as typeof globalThis & {
	__providerColorCache?: ColorCache;
};

export async function GET(request: NextRequest) {
	const providers = providerSlugs(
		request.nextUrl.searchParams.get("providers"),
	);
	const colors: Record<string, string> = {};
	await Promise.all(
		providers.map(async (provider) => {
			const color = await cachedProviderColor(provider);
			if (color != null) {
				colors[provider] = color;
			}
		}),
	);
	return Response.json(colors, {
		headers: PROVIDER_COLOR_CACHE_HEADERS,
	});
}

function providerSlugs(value: string | null) {
	return [
		...new Set(
			(value ?? "")
				.split(",")
				.map((provider) => provider.trim())
				.filter((provider) => /^[a-z0-9._-]+$/.test(provider)),
		),
	].slice(0, MAX_PROVIDER_COLOR_BATCH_SIZE);
}

async function cachedProviderColor(provider: string) {
	const cache = getColorCache();
	if (cache.has(provider)) {
		return cache.get(provider) ?? null;
	}
	const color = await deriveIconThemeColor(provider);
	cache.set(provider, color);
	return color;
}

function getColorCache() {
	globalColorCache.__providerColorCache ??= new Map<string, string | null>();
	return globalColorCache.__providerColorCache;
}

async function deriveIconThemeColor(provider: string) {
	try {
		const image = await readFile(resolve(LOGO_ROOT, `${provider}.png`));
		const { default: sharp } = await import("sharp");
		const { data, info } = await sharp(image)
			.ensureAlpha()
			.resize(64, 64, { fit: "inside" })
			.raw()
			.toBuffer({ resolveWithObject: true });
		return prominentIconColor(data, info.channels);
	} catch {
		return null;
	}
}

function prominentIconColor(data: Buffer, channels: number) {
	const hueBins = new Map<number, HueBin>();
	let visiblePixels = 0;
	let chromaticPixels = 0;
	for (let offset = 0; offset < data.length; offset += channels) {
		const alpha = data[offset + 3] ?? 255;
		if (alpha < 40) {
			continue;
		}
		visiblePixels += 1;
		const red = data[offset] ?? 0;
		const green = data[offset + 1] ?? 0;
		const blue = data[offset + 2] ?? 0;
		const hsl = rgbToHsl(red, green, blue);
		if (!isUsableChroma(hsl)) {
			continue;
		}
		chromaticPixels += 1;
		const binKey = Math.round(hsl.h / HUE_BIN_DEGREES) * HUE_BIN_DEGREES;
		const weight = hsl.s * (alpha / 255);
		const bin = hueBins.get(binKey) ?? { h: 0, s: 0, l: 0, weight: 0 };
		bin.h += hsl.h * weight;
		bin.s += hsl.s * weight;
		bin.l += hsl.l * weight;
		bin.weight += weight;
		hueBins.set(binKey, bin);
	}
	const chromaShare = chromaticPixels / Math.max(visiblePixels, 1);
	const [dominant] = [...hueBins.values()].sort(
		(left, right) => right.weight - left.weight,
	);
	if (!dominant || chromaShare < MIN_CHROMA_SHARE) {
		return visiblePixels > 0 ? DARK_UI_MONOCHROME : null;
	}
	return hslToHex({
		h: dominant.h / dominant.weight,
		s: clamp(dominant.s / dominant.weight, 0.54, 0.82),
		l: clamp(dominant.l / dominant.weight, 0.48, 0.68),
	});
}

type HueBin = {
	h: number;
	s: number;
	l: number;
	weight: number;
};

type Hsl = {
	h: number;
	s: number;
	l: number;
};

function isUsableChroma({ s, l }: Hsl) {
	return s >= 0.28 && l >= 0.13 && l <= 0.9;
}

function rgbToHsl(red: number, green: number, blue: number): Hsl {
	const r = red / 255;
	const g = green / 255;
	const b = blue / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const lightness = (max + min) / 2;
	const delta = max - min;
	if (delta === 0) {
		return { h: 0, s: 0, l: lightness };
	}
	const saturation =
		lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let hue = 0;
	if (max === r) {
		hue = (g - b) / delta + (g < b ? 6 : 0);
	} else if (max === g) {
		hue = (b - r) / delta + 2;
	} else {
		hue = (r - g) / delta + 4;
	}
	return { h: hue * 60, s: saturation, l: lightness };
}

function hslToHex({ h, s, l }: Hsl) {
	const chroma = (1 - Math.abs(2 * l - 1)) * s;
	const hue = ((h % 360) + 360) % 360;
	const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = l - chroma / 2;
	let red = 0;
	let green = 0;
	let blue = 0;
	if (hue < 60) {
		red = chroma;
		green = x;
	} else if (hue < 120) {
		red = x;
		green = chroma;
	} else if (hue < 180) {
		green = chroma;
		blue = x;
	} else if (hue < 240) {
		green = x;
		blue = chroma;
	} else if (hue < 300) {
		red = x;
		blue = chroma;
	} else {
		red = chroma;
		blue = x;
	}
	return rgbToHex(
		Math.round((red + m) * 255),
		Math.round((green + m) * 255),
		Math.round((blue + m) * 255),
	);
}

function rgbToHex(red: number, green: number, blue: number) {
	return `#${[red, green, blue]
		.map((value) =>
			clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"),
		)
		.join("")}`;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
