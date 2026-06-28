/** Provider logo color extraction for Model Atlas. */
const DARK_UI_MONOCHROME = "#eeeeea";
const HUE_BIN_DEGREES = 12;
const MIN_CHROMA_SHARE = 0.04;

export async function providerIconColor(imageBuffer: Buffer) {
	const { default: sharp } = await import("sharp");
	const { data, info } = await sharp(imageBuffer)
		.ensureAlpha()
		.resize(64, 64, { fit: "inside" })
		.raw()
		.toBuffer({ resolveWithObject: true });
	return prominentIconColor(data, info.channels);
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

/** Checks whether a pixel has enough saturation and lightness to represent a logo. */
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
	return rgbToHex({
		red: Math.round((red + m) * 255),
		green: Math.round((green + m) * 255),
		blue: Math.round((blue + m) * 255),
	});
}

/** Bounds color channel values to the requested range. */
function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function rgbToHex({
	red,
	green,
	blue,
}: {
	red: number;
	green: number;
	blue: number;
}) {
	return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
}

function hexByte(value: number) {
	return clamp(value, 0, 255).toString(16).padStart(2, "0");
}
