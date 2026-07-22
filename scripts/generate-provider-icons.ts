/** Provider icon generation for Model Atlas. */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readDatabasePayload } from "../src/model-atlas/database";
import {
	resizeLogoToPng,
	statsLogoCacheDir,
} from "../src/model-atlas/logos/cache";
import { providerIconColor } from "../src/model-atlas/logos/color";

type ProviderAsset = {
	logo: string;
	color: string;
};

type ProviderAssetMap = Record<string, ProviderAsset>;

const GENERATED_PATH = "app/dashboard/shared/provider-assets.generated.ts";
const LOGO_SIZE = 64;

const force = process.argv.includes("--force");

const existingAssets = force ? {} : await readExistingAssets();
const logoSources = readLogoSources();
const nextAssets: ProviderAssetMap = { ...existingAssets };

for (const [provider, source] of [...logoSources].sort()) {
	if (nextAssets[provider] != null) {
		continue;
	}
	const logoBuffer = await readLogoBuffer(provider, source);
	if (logoBuffer == null) {
		continue;
	}
	const logoPng = await resizeLogoToPng(logoBuffer);
	const color = (await providerIconColor(logoPng)) ?? "#eeeeea";
	nextAssets[provider] = {
		logo: svgDataUrl(logoPng),
		color,
	};
}

await writeFile(resolve(GENERATED_PATH), providerAssetsModule(nextAssets));

console.log(
	JSON.stringify(
		{
			path: GENERATED_PATH,
			providers: Object.keys(nextAssets).length,
			added:
				Object.keys(nextAssets).length - Object.keys(existingAssets).length,
			force,
		},
		null,
		2,
	),
);

async function readExistingAssets(): Promise<ProviderAssetMap> {
	try {
		const moduleUrl = pathToFileURL(resolve(GENERATED_PATH)).href;
		const module = (await import(moduleUrl)) as {
			providerAssets?: ProviderAssetMap;
		};
		return module.providerAssets ?? {};
	} catch {
		return {};
	}
}

function readLogoSources() {
	const sources = new Map<string, string>();
	for (const model of readDatabasePayload().models) {
		const provider = providerSlug(model.provider);
		if (provider.length === 0) {
			continue;
		}
		const logo = typeof model.logo === "string" ? model.logo : "";
		if (!sources.has(provider) || (sources.get(provider) === "" && logo)) {
			sources.set(provider, logo);
		}
	}
	return sources;
}

async function readLogoBuffer(provider: string, source: string) {
	if (source.startsWith("data:image/")) {
		return decodeDataUrl(source);
	}
	try {
		return await readFile(resolve(statsLogoCacheDir(), `${provider}.png`));
	} catch {
		return null;
	}
}

function decodeDataUrl(source: string) {
	const base64Marker = ";base64,";
	const base64Index = source.indexOf(base64Marker);
	if (base64Index >= 0) {
		return Buffer.from(
			source.slice(base64Index + base64Marker.length),
			"base64",
		);
	}
	const commaIndex = source.indexOf(",");
	if (commaIndex < 0) {
		return null;
	}
	return Buffer.from(decodeURIComponent(source.slice(commaIndex + 1)), "utf8");
}

function svgDataUrl(imageBuffer: Buffer) {
	const imageHref = `data:image/png;base64,${imageBuffer.toString("base64")}`;
	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_SIZE}" height="${LOGO_SIZE}" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}">`,
		`<image href="${imageHref}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"/>`,
		"</svg>",
	].join("");
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function providerAssetsModule(assets: ProviderAssetMap) {
	const entries = Object.entries(assets)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([provider, asset]) => {
			const key = /^[A-Za-z_$][\w$]*$/.test(provider)
				? provider
				: JSON.stringify(provider);
			return [
				`\t${key}: {`,
				`\t\tcolor: ${JSON.stringify(asset.color)},`,
				`\t\tlogo: ${JSON.stringify(asset.logo)},`,
				"\t},",
			].join("\n");
		})
		.join("\n");
	return [
		"// Generated provider assets from scripts/generate-provider-icons.ts. Do not edit directly.",
		"",
		"type ProviderAsset = {",
		"\tcolor: string;",
		"\tlogo: string;",
		"};",
		"",
		"export const providerAssets = {",
		entries,
		"} as const satisfies Record<string, ProviderAsset>;",
		"",
	].join("\n");
}

function providerSlug(provider: string | null | undefined) {
	return String(provider ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
