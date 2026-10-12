/**
 * Benchmark leaderboard JSON from Vals AI.
 *
 * Page source: https://www.vals.ai/benchmarks
 */

import { asRecord, stringValue } from "../../runtime";
import { htmlAttribute } from "../parsing";
import { fetchSource } from "../request-scheduler";

export type ValsBenchmarkView = {
  metadata: Record<string, unknown>;
  tasks: Record<string, Record<string, Record<string, unknown>>>;
};

/** Resolve the current page's JSON asset while keeping both requests inside the shared source scheduler. */
export async function getValsBenchmarkView(
  pageUrl: string,
  timeoutMs: number,
): Promise<ValsBenchmarkView> {
  const page = await fetchSource(pageUrl, {}, timeoutMs, async (response) => {
    if (!response.ok) throw new Error(`Vals page failed: ${response.status}`);
    return response.text();
  });
  const island = page.match(
    /<astro-island\b(?=[^>]*component-url="\/_astro\/BenchmarkViewLoader\.[^"]*")[^>]*>/,
  )?.[0];
  const props = island == null ? null : htmlAttribute(island, "props");
  const reference = props == null ? null : asRecord(JSON.parse(props)).benchmarkViewUrl;
  const assetPath =
    Array.isArray(reference) && reference[0] === 0 ? stringValue(reference[1]) : null;
  if (assetPath == null) throw new Error("Vals page has no benchmark JSON reference");
  const assetUrl = new URL(assetPath, pageUrl);
  if (assetUrl.origin !== new URL(pageUrl).origin) {
    throw new Error("Vals benchmark JSON must share the page origin");
  }
  return fetchSource(assetUrl.href, {}, timeoutMs, async (response) => {
    if (!response.ok) throw new Error(`Vals benchmark JSON failed: ${response.status}`);
    const view = parseValsBenchmarkView(await response.json());
    if (view == null) throw new Error("Vals benchmark JSON has no usable metadata or tasks");
    return view;
  });
}

/** Decode the publisher's plain JSON without executing its frontend or accepting an empty leaderboard. */
export function parseValsBenchmarkView(value: unknown): ValsBenchmarkView | null {
  const source = asRecord(value);
  const metadata = asRecord(source.metadata);
  const sourceTasks = asRecord(source.tasks);
  if (Object.keys(metadata).length === 0 || Object.keys(sourceTasks).length === 0) return null;
  const tasks = Object.fromEntries(
    Object.entries(sourceTasks).map(([task, models]) => [
      task,
      Object.fromEntries(Object.entries(asRecord(models)).map(([id, row]) => [id, asRecord(row)])),
    ]),
  );
  return { metadata, tasks };
}
