/** Vending-Bench 2 scraper preserves long-horizon balance curves and final business outcomes. */

import { benchmarkModelEffort } from "../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../utils";
import { findObjectEnd } from "./parsing";

const DEFAULT_LEADERBOARD_URL = "https://andonlabs.com/evals/vending-bench-2";
const DEFAULT_TIMEOUT_MS = 30_000;
const ROUTE_NODE_PATTERN = /\/_app\/immutable\/nodes\/[^"'<>\s]+\.js/g;
const CHUNK_IMPORT_PATTERN = /from"(\.\.\/chunks\/[^"']+\.js)"/g;
const VB2_RUNS_MARKER = "vb2:";
const VB2_ROW_PATTERN =
	/"((?:\\.|[^"\\])+)":\{num_epochs:(\d+),time_series:\[([^\]]*)\],final_value:([-+\d.eE]+)\}/g;

export type VendingBench2ModelScoreRow = {
	rank: number;
	model: string;
	base_model: string;
	reasoning_effort: string | null;
	run_count: number;
	final_balance_usd: number;
	daily_balance_usd: number[];
};

export type VendingBench2ScoreByModelName = Map<
	string,
	VendingBench2ModelScoreRow
>;

export type VendingBench2Payload = {
	fetched_at_epoch_seconds: number | null;
	source_url?: string;
	data: VendingBench2ModelScoreRow[];
};

export type VendingBench2ScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

function parseNumberList(value: string): number[] | null {
	if (value.trim().length === 0) {
		return [];
	}
	const numbers = value.split(",").map(Number);
	return numbers.every(Number.isFinite) ? numbers : null;
}

function decodeQuotedString(value: string): string | null {
	try {
		const parsed = JSON.parse(`"${value}"`);
		return typeof parsed === "string" && parsed.length > 0 ? parsed : null;
	} catch {
		return null;
	}
}

/** Parse the official Svelte data module rather than the page's top-ten-only HTML table. */
export function processVendingBench2DataModule(
	dataModule: string,
): VendingBench2ModelScoreRow[] {
	const markerIndex = dataModule.indexOf(VB2_RUNS_MARKER);
	if (markerIndex === -1) {
		return [];
	}
	const objectStart = markerIndex + VB2_RUNS_MARKER.length;
	const objectEnd = findObjectEnd(dataModule, objectStart);
	if (objectEnd === -1) {
		return [];
	}
	const rows: Omit<VendingBench2ModelScoreRow, "rank">[] = [];
	for (const match of dataModule
		.slice(objectStart, objectEnd + 1)
		.matchAll(VB2_ROW_PATTERN)) {
		const model = decodeQuotedString(match[1] ?? "");
		const runCount = Number(match[2]);
		const dailyBalanceUsd = parseNumberList(match[3] ?? "");
		const finalBalanceUsd = Number(match[4]);
		if (
			model == null ||
			!Number.isInteger(runCount) ||
			runCount <= 0 ||
			dailyBalanceUsd == null ||
			dailyBalanceUsd.length === 0 ||
			!Number.isFinite(finalBalanceUsd)
		) {
			continue;
		}
		const { baseModel, reasoningEffort } = benchmarkModelEffort(model);
		rows.push({
			model,
			base_model: baseModel,
			reasoning_effort: reasoningEffort,
			run_count: runCount,
			final_balance_usd: finalBalanceUsd,
			daily_balance_usd: dailyBalanceUsd,
		});
	}
	return rows
		.sort((left, right) => right.final_balance_usd - left.final_balance_usd)
		.map((row, index) => ({ rank: index + 1, ...row }));
}

async function responseText(url: string, timeoutMs: number): Promise<string> {
	const response = await fetchWithTimeout(url, {}, timeoutMs);
	if (!response.ok) {
		throw new Error(`Vending-Bench 2 asset fetch failed: ${response.status}`);
	}
	return response.text();
}

async function vendingDataModule(
	pageHtml: string,
	pageUrl: string,
	timeoutMs: number,
): Promise<{ url: string; text: string } | null> {
	const nodeUrls = [
		...new Set(
			[...pageHtml.matchAll(ROUTE_NODE_PATTERN)].map(
				(match) => new URL(match[0], pageUrl).href,
			),
		),
	];
	const nodeModules = await Promise.all(
		nodeUrls.map(async (url) => ({
			url,
			text: await responseText(url, timeoutMs),
		})),
	);
	for (const nodeModule of nodeModules) {
		const chunkUrls = [
			...new Set(
				[...nodeModule.text.matchAll(CHUNK_IMPORT_PATTERN)].map(
					(match) => new URL(match[1] ?? "", nodeModule.url).href,
				),
			),
		];
		const chunks = await Promise.all(
			chunkUrls.map(async (url) => ({
				url,
				text: await responseText(url, timeoutMs),
			})),
		);
		const dataModule = chunks.find((chunk) =>
			chunk.text.includes(VB2_RUNS_MARKER),
		);
		if (dataModule != null) {
			return dataModule;
		}
	}
	return null;
}

export async function getVendingBench2Stats(
	options: VendingBench2ScraperOptions = {},
): Promise<VendingBench2Payload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const pageHtml = await responseText(url, timeoutMs);
		const dataModule = await vendingDataModule(pageHtml, url, timeoutMs);
		const data =
			dataModule == null ? [] : processVendingBench2DataModule(dataModule.text);
		return {
			fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
			source_url: dataModule?.url,
			data,
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
