/** Published index baskets describe breadth and overlap; membership is metadata, never a reconstructed measurement. */
import type { HistoricalPortfolio } from "./types";

export const AA_METHODOLOGY_URL =
  "https://artificialanalysis.ai/methodology/intelligence-benchmarking";

const AA_PORTFOLIOS = [
  {
    id: "2.0",
    labels: [
      "MMLU-Pro",
      "GPQA Diamond",
      "HLE",
      "MATH-500",
      "AIME 2024",
      "SciCode",
      "LiveCodeBench",
    ],
  },
  {
    id: "2.1",
    labels: ["MMLU-Pro", "GPQA Diamond", "HLE", "AIME 2025", "SciCode", "LiveCodeBench", "IFBench"],
  },
  {
    id: "2.2",
    labels: [
      "MMLU-Pro",
      "GPQA Diamond",
      "HLE",
      "AIME 2025",
      "SciCode",
      "LiveCodeBench",
      "IFBench",
      "AA-LCR",
    ],
  },
  {
    id: "3.0",
    labels: [
      "MMLU-Pro",
      "GPQA Diamond",
      "HLE",
      "AIME 2025",
      "SciCode",
      "LiveCodeBench",
      "IFBench",
      "AA-LCR",
      "Terminal-Bench Hard",
      "τ²-Telecom",
    ],
  },
  {
    id: "4.0",
    labels: [
      "GPQA Diamond",
      "HLE",
      "SciCode",
      "IFBench",
      "AA-LCR",
      "Terminal-Bench Hard",
      "τ²-Telecom",
      "GDPval-AA",
      "AA-Omniscience",
      "CritPt",
    ],
  },
  {
    id: "4.1",
    labels: [
      "GPQA Diamond",
      "HLE",
      "SciCode",
      "AA-LCR",
      "Terminal-Bench 2.1",
      "τ³-Banking",
      "GDPval-AA v2",
      "AA-Omniscience",
      "CritPt",
    ],
  },
  {
    id: "4.2",
    labels: [
      "HLE",
      "SciCode",
      "AA-LCR v1.1",
      "Terminal-Bench 2.1",
      "τ³-Banking",
      "GDPval-AA v2",
      "AA-Omniscience",
      "CritPt",
      "AA-Briefcase",
      "GDP.pdf",
    ],
  },
  {
    id: "4.3",
    labels: [
      "HLE",
      "SciCode",
      "AA-LCR v1.1",
      "Terminal-Bench 4.0",
      "AutomationBench-AA",
      "GDPval-AA v2",
      "AA-Omniscience",
      "CritPt",
      "AA-Briefcase",
      "GDP.pdf",
    ],
  },
];

/** Retain every named constituent even when its underlying measurements are unavailable. */
export function artificialAnalysisPortfolios(): HistoricalPortfolio[] {
  return AA_PORTFOLIOS.map(({ id, labels }) => ({
    id: `aa:${id}`,
    label: `Artificial Analysis v${id}`,
    source: AA_METHODOLOGY_URL,
    components: labels.map((label) => ({ label, benchmarkId: null })),
    note: "Published index membership for benchmark-count and overlap checks; component measurements are not imported or reconstructed.",
  }));
}
