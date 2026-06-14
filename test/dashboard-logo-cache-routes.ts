import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

import { GET as getLogo } from "../app/api/logos/[logo]/route";
import { GET as getProviderColors } from "../app/api/provider-colors/route";

const cacheDir = resolve(".cache/dashboard-logo-cache-routes");
process.env.MODEL_ATLAS_LOGO_CACHE_DIR = cacheDir;

await rm(cacheDir, { force: true, recursive: true });
await mkdir(cacheDir, { recursive: true });

const logo = await writeSolidLogo("example", {
	r: 225,
	g: 52,
	b: 44,
	alpha: 1,
});

const logoResponse = await getLogo(
	routeRequest("http://model-atlas.test/api/logos/example.png"),
);

assert.equal(logoResponse.status, 200);
assert.equal(
	logoResponse.headers.get("Content-Type"),
	"image/png",
	"logo route should serve cached PNGs from the shared logo cache directory",
);
assert.deepEqual(Buffer.from(await logoResponse.arrayBuffer()), logo);

const colorResponse = await getProviderColors(
	routeRequest("http://model-atlas.test/api/provider-colors?providers=example"),
);
const colors = (await colorResponse.json()) as Record<string, string>;
const exampleColor = colors.example;

assert.equal(colorResponse.status, 200);
if (typeof exampleColor !== "string") {
	throw new TypeError("Expected derived provider color for example");
}
assert.match(
	exampleColor,
	/^#[0-9a-f]{6}$/i,
	"provider color route should derive colors from the shared logo cache directory",
);

const missingColorResponse = await getProviderColors(
	routeRequest("http://model-atlas.test/api/provider-colors?providers=late"),
);
assert.deepEqual(
	await missingColorResponse.json(),
	{},
	"provider color misses should not invent colors",
);
await writeSolidLogo("late", {
	r: 34,
	g: 160,
	b: 94,
	alpha: 1,
});
const lateColorResponse = await getProviderColors(
	routeRequest("http://model-atlas.test/api/provider-colors?providers=late"),
);
const lateColors = (await lateColorResponse.json()) as Record<string, string>;
const lateColor = lateColors.late;
if (typeof lateColor !== "string") {
	throw new TypeError("Expected derived provider color after late cache write");
}
assert.match(
	lateColor,
	/^#[0-9a-f]{6}$/i,
	"provider color misses should not be cached before the logo appears",
);

await rm(cacheDir, { force: true, recursive: true });
delete process.env.MODEL_ATLAS_LOGO_CACHE_DIR;

async function writeSolidLogo(
	provider: string,
	background: { r: number; g: number; b: number; alpha: number },
) {
	const logo = await sharp({
		create: {
			width: 32,
			height: 32,
			channels: 4,
			background,
		},
	})
		.png()
		.toBuffer();
	await writeFile(resolve(cacheDir, `${provider}.png`), logo);
	return logo;
}

function routeRequest(url: string) {
	return {
		nextUrl: new URL(url),
	} as Parameters<typeof getLogo>[0];
}
