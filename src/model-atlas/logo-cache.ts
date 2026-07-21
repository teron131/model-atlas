/** Disk-backed provider logo caching owns fetch coalescing, resize bounds, and local/Vercel cache paths. */

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { fetchWithTimeout } from "./utils";

const LOGO_CACHE_SIZE = 64;
const LOGO_FETCH_TIMEOUT_MS = 15_000;

const pendingLogoRequestByKey = new Map<string, Promise<string>>();

function safeLogoCacheStem(cacheKey: string | null | undefined): string | null {
	const normalized = cacheKey
		?.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized && normalized.length > 0 ? normalized : null;
}

function logoCachePath(source: string, cacheKey?: string | null): string {
	const logoCacheDir = statsLogoCacheDir();
	const safeCacheKey = safeLogoCacheStem(cacheKey);
	if (safeCacheKey) {
		return resolve(logoCacheDir, `${safeCacheKey}.png`);
	}
	const sourceHash = createHash("sha256").update(source).digest("hex");
	return resolve(logoCacheDir, `${sourceHash}.png`);
}

export function statsLogoCacheDir(): string {
	if (process.env.MODEL_ATLAS_LOGO_CACHE_DIR) {
		return resolve(process.env.MODEL_ATLAS_LOGO_CACHE_DIR);
	}
	if (process.env.VERCEL === "1") {
		return resolve(tmpdir(), "model-atlas/stats-logos");
	}
	return resolve(".cache/stats-logos");
}

function pngDataUrl(imageBuffer: Buffer): string {
	return `data:image/png;base64,${imageBuffer.toString("base64")}`;
}

async function loadCachedLogoDataUrl(
	cachePath: string,
): Promise<string | null> {
	try {
		await access(cachePath);
		const imageBuffer = await readFile(cachePath);
		const { default: sharp } = await import("sharp");
		const metadata = await sharp(imageBuffer).metadata();
		if (
			metadata.width != null &&
			metadata.width <= LOGO_CACHE_SIZE &&
			metadata.height != null &&
			metadata.height <= LOGO_CACHE_SIZE
		) {
			return pngDataUrl(imageBuffer);
		}
		const resizedLogoBuffer = await resizeLogoToPng(imageBuffer);
		if (!imageBuffer.equals(resizedLogoBuffer)) {
			await saveCachedLogoBuffer(cachePath, resizedLogoBuffer);
		}
		return pngDataUrl(resizedLogoBuffer);
	} catch {
		return null;
	}
}

async function saveCachedLogoBuffer(
	cachePath: string,
	imageBuffer: Buffer,
): Promise<void> {
	await mkdir(statsLogoCacheDir(), { recursive: true });
	await writeFile(cachePath, imageBuffer);
}

/** Resize remote logo bytes into a bounded transparent PNG. */
export async function resizeLogoToPng(imageBuffer: Buffer): Promise<Buffer> {
	const { default: sharp } = await import("sharp");
	return sharp(imageBuffer, { density: 300 })
		.trim({
			background: {
				r: 0,
				g: 0,
				b: 0,
				alpha: 0,
			},
			threshold: 8,
		})
		.resize(LOGO_CACHE_SIZE, LOGO_CACHE_SIZE, {
			fit: "contain",
			background: {
				r: 0,
				g: 0,
				b: 0,
				alpha: 0,
			},
			withoutEnlargement: true,
		})
		.png()
		.toBuffer();
}

async function buildCachedLogoDataUrl(
	source: string,
	cacheKey?: string | null,
): Promise<string> {
	const cachePath = logoCachePath(source, cacheKey);
	const cachedLogoDataUrl = await loadCachedLogoDataUrl(cachePath);
	if (cachedLogoDataUrl) {
		return cachedLogoDataUrl;
	}

	const response = await fetchWithTimeout(
		source,
		{
			method: "GET",
		},
		LOGO_FETCH_TIMEOUT_MS,
	);
	if (!response.ok) {
		throw new Error(`Failed to fetch logo: ${source}`);
	}

	const imageBuffer = Buffer.from(await response.arrayBuffer());
	const resizedLogoBuffer = await resizeLogoToPng(imageBuffer);
	await saveCachedLogoBuffer(cachePath, resizedLogoBuffer);
	return pngDataUrl(resizedLogoBuffer);
}

/** Logo fetches are deduplicated by source while cache files can still use stable model or provider keys. */
function uniqueLogoSources<TModel extends { logo: string }>(
	models: TModel[],
	cacheKeyForModel: (model: TModel) => string | null | undefined,
): Array<{ source: string; cacheKey: string | null }> {
	const sourceEntries = new Map<
		string,
		{ source: string; cacheKey: string | null }
	>();
	for (const model of models) {
		if (model.logo.length === 0 || sourceEntries.has(model.logo)) {
			continue;
		}
		sourceEntries.set(model.logo, {
			source: model.logo,
			cacheKey: safeLogoCacheStem(cacheKeyForModel(model)),
		});
	}
	return [...sourceEntries.values()];
}

/** Cache one remote logo source and return the cached data URL when possible. */
async function cacheStatsLogo(
	source: string,
	cacheKey?: string | null,
): Promise<string> {
	if (source.length === 0 || !/^https?:\/\//i.test(source)) {
		return source;
	}

	const requestKey = `${safeLogoCacheStem(cacheKey) ?? source}:${source}`;
	const existingRequest = pendingLogoRequestByKey.get(requestKey);
	if (existingRequest) {
		return existingRequest;
	}

	const request = buildCachedLogoDataUrl(source, cacheKey)
		.catch(() => source)
		.finally(() => {
			pendingLogoRequestByKey.delete(requestKey);
		});
	pendingLogoRequestByKey.set(requestKey, request);
	return request;
}

/** Cache remote logos for a model list while preserving the original model rows. */
export async function cacheStatsLogos<
	TModel extends {
		logo: string;
	},
>(
	models: TModel[],
	cacheKeyForModel: (model: TModel) => string | null | undefined = () => null,
): Promise<TModel[]> {
	const cachedLogoBySource = new Map<string, string>();
	const uniqueSources = uniqueLogoSources(models, cacheKeyForModel);

	await Promise.all(
		uniqueSources.map(async ({ source, cacheKey }) => {
			cachedLogoBySource.set(source, await cacheStatsLogo(source, cacheKey));
		}),
	);

	return models.map((model) => ({
		...model,
		logo: cachedLogoBySource.get(model.logo) ?? model.logo,
	}));
}
