/** Benchmark labels, display order, tooltips, and domain icons derived once from the benchmark catalog, so graphs and tables name, order, and mark benchmarks alike. */

import {
  BookOpen,
  CodeXml,
  Eye,
  Feather,
  FileText,
  FlaskConical,
  Gamepad2,
  Landmark,
  type LucideIcon,
  PenTool,
  Puzzle,
  Scale,
  Sigma,
  Stethoscope,
  Telescope,
  Wrench,
} from "lucide-react";

import {
  BENCHMARK_DISPLAY_ORDER,
  BENCHMARK_LABELS,
  BENCHMARK_TOOLTIPS,
  type BenchmarkDomain,
} from "../../../src/model-atlas/benchmarks/catalog";
import type { ModelAtlasColumnTooltip } from "../../../src/model-atlas/config/tooltips";

export const benchmarkLabels: Readonly<Record<string, string>> = BENCHMARK_LABELS;
const benchmarkDisplayOrder = new Map(BENCHMARK_DISPLAY_ORDER.map((key, order) => [key, order]));

/** Apply the catalog's stable display order while keeping unknown payload keys deterministic. */
export function compareBenchmarkDisplayKeys(left: string, right: string): number {
  const orderDifference =
    (benchmarkDisplayOrder.get(left as keyof typeof BENCHMARK_LABELS) ?? Number.MAX_SAFE_INTEGER) -
    (benchmarkDisplayOrder.get(right as keyof typeof BENCHMARK_LABELS) ?? Number.MAX_SAFE_INTEGER);
  if (orderDifference !== 0) {
    return orderDifference;
  }
  const labelDifference = (benchmarkLabels[left] ?? left).localeCompare(
    benchmarkLabels[right] ?? right,
    "en",
    { sensitivity: "base" },
  );
  return labelDifference !== 0 ? labelDifference : left.localeCompare(right);
}

export const benchmarkTooltips: Readonly<Record<string, ModelAtlasColumnTooltip>> =
  Object.fromEntries(
    BENCHMARK_DISPLAY_ORDER.map((key) => {
      const tooltip = BENCHMARK_TOOLTIPS[key];
      const version = "version" in tooltip ? tooltip.version : null;
      return [
        key,
        {
          ...tooltip,
          title: BENCHMARK_LABELS[key],
          rows: version ? [["Version", `v${version}`], ...tooltip.rows] : tooltip.rows,
        },
      ];
    }),
  );

export const domainIcons: Readonly<Record<BenchmarkDomain, LucideIcon>> = {
  coding: CodeXml,
  documents: FileText,
  writing: Feather,
  design: PenTool,
  vision: Eye,
  tool_use: Wrench,
  research: Telescope,
  games: Gamepad2,
  puzzles: Puzzle,
  math: Sigma,
  science: FlaskConical,
  finance: Landmark,
  healthcare: Stethoscope,
  legal: Scale,
  knowledge: BookOpen,
};
