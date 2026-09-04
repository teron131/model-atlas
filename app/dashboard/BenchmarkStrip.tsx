/** Benchmark coverage groups and viewport-anchored explanations for the current global model view. */

import { Star } from "lucide-react";
import {
  type CSSProperties,
  type FocusEvent,
  memo,
  type MouseEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import {
  benchmarkCoverage,
  benchmarkCoverageLabel,
  benchmarkTooltip,
} from "./shared/benchmark-tooltips";
import {
  ColumnTooltip,
  tooltipPositionFromElement,
  type TooltipState,
} from "./shared/ColumnTooltip";
import {
  benchmarkGroups,
  benchmarkLabels,
  benchmarkTooltips,
  compareBenchmarkDisplayKeys,
} from "./shared/constants";

const loadingCounts: Record<string, number> = {
  Intelligence: 6,
  Agent: 5,
};

export const BenchmarkStrip = memo(function BenchmarkStrip({
  payload,
  models,
  isLoading,
  unit = "models",
}: {
  payload: ModelAtlasPayload | null;
  models: ModelAtlasPayload["models"];
  isLoading: boolean;
  unit?: "models" | "variants";
}) {
  const scoring = payload?.metadata?.scoring;
  const benchmarkPortfolio = scoring?.benchmark_portfolio ?? {};
  const frontierKeys = new Set(
    Object.entries(benchmarkPortfolio)
      .filter(([, entry]) => entry.group === "frontier")
      .map(([key]) => key),
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredBenchmarkKey, setHoveredBenchmarkKey] = useState<string | null>(null);
  const activeTooltipContent =
    tooltip == null ? undefined : benchmarkTooltip(tooltip.key, { models, scoring, unit });
  const clearBenchmarkHover = useCallback(() => {
    setTooltip(null);
    setHoveredBenchmarkKey(null);
  }, []);
  const showBenchmarkHover = useCallback(
    (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, key: string) => {
      setHoveredBenchmarkKey(key);
      if (!benchmarkTooltips[key]) {
        return;
      }
      setTooltip({
        key,
        phase: "visible",
        ...tooltipPositionFromElement(event.currentTarget),
      });
    },
    [],
  );

  useEffect(() => {
    if (tooltip == null) {
      return;
    }
    window.addEventListener("scroll", clearBenchmarkHover, { capture: true, passive: true });
    window.addEventListener("resize", clearBenchmarkHover);
    return () => {
      window.removeEventListener("scroll", clearBenchmarkHover, true);
      window.removeEventListener("resize", clearBenchmarkHover);
    };
  }, [tooltip, clearBenchmarkHover]);

  return (
    <section className="benchmarks" aria-label="Selected benchmarks">
      <h2>Selected benchmarks</h2>
      <div className="benchmark-groups">
        {benchmarkGroups.map(({ field, fallbackField, label }) => {
          const keys = [...(scoring?.[field] ?? scoring?.[fallbackField] ?? [])].sort(
            compareBenchmarkDisplayKeys,
          );
          return (
            <BenchmarkGroup
              key={field}
              label={label}
              keys={keys}
              models={models}
              frontierBenchmarkKeys={frontierKeys}
              isLoading={isLoading}
              hoveredBenchmarkKey={hoveredBenchmarkKey}
              onHover={showBenchmarkHover}
              onHoverEnd={clearBenchmarkHover}
            />
          );
        })}
      </div>
      {/* The sticky rail's backdrop filter must not become the tooltip's coordinate origin. */}
      {tooltip != null &&
        activeTooltipContent != null &&
        createPortal(
          <ColumnTooltip content={activeTooltipContent} left={tooltip.left} top={tooltip.top} />,
          document.body,
        )}
    </section>
  );
});

function BenchmarkGroup({
  label,
  keys,
  models,
  frontierBenchmarkKeys,
  isLoading,
  hoveredBenchmarkKey,
  onHover,
  onHoverEnd,
}: {
  label: string;
  keys: string[];
  models: ModelAtlasPayload["models"];
  frontierBenchmarkKeys: ReadonlySet<string>;
  isLoading: boolean;
  hoveredBenchmarkKey: string | null;
  onHover: (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, key: string) => void;
  onHoverEnd: () => void;
}) {
  return (
    <div className="benchmark-group">
      <div className="benchmark-group-label" data-count={isLoading ? "sync" : keys.length}>
        <span>{label}</span>
      </div>
      {isLoading ? (
        <LoadingBenchmarkList label={label} />
      ) : (
        <BenchmarkList
          keys={keys}
          models={models}
          frontierBenchmarkKeys={frontierBenchmarkKeys}
          hoveredBenchmarkKey={hoveredBenchmarkKey}
          onHover={onHover}
          onHoverEnd={onHoverEnd}
        />
      )}
    </div>
  );
}

function BenchmarkList({
  keys,
  models,
  frontierBenchmarkKeys,
  hoveredBenchmarkKey,
  onHover,
  onHoverEnd,
}: {
  keys: string[];
  models: ModelAtlasPayload["models"];
  frontierBenchmarkKeys: ReadonlySet<string>;
  hoveredBenchmarkKey: string | null;
  onHover: (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, key: string) => void;
  onHoverEnd: () => void;
}) {
  const frontierKeys = keys.filter((key) => frontierBenchmarkKeys.has(key));
  const baselineKeys = keys.filter((key) => !frontierBenchmarkKeys.has(key));
  return (
    <>
      {frontierKeys.length > 0 && (
        <BenchmarkTier
          tier="frontier"
          keys={frontierKeys}
          models={models}
          hoveredBenchmarkKey={hoveredBenchmarkKey}
          onHover={onHover}
          onHoverEnd={onHoverEnd}
        />
      )}
      {baselineKeys.length > 0 && (
        <BenchmarkTier
          tier="baseline"
          keys={baselineKeys}
          models={models}
          hoveredBenchmarkKey={hoveredBenchmarkKey}
          onHover={onHover}
          onHoverEnd={onHoverEnd}
        />
      )}
    </>
  );
}

function BenchmarkTier({
  tier,
  keys,
  models,
  hoveredBenchmarkKey,
  onHover,
  onHoverEnd,
}: {
  tier: "frontier" | "baseline";
  keys: string[];
  models: ModelAtlasPayload["models"];
  hoveredBenchmarkKey: string | null;
  onHover: (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, key: string) => void;
  onHoverEnd: () => void;
}) {
  const isFrontier = tier === "frontier";
  const label = isFrontier ? "Frontier" : "Baseline";
  return (
    <section className="benchmark-tier" aria-label={`${label} benchmarks`}>
      <h3 className="benchmark-tier-label">{label}</h3>
      <ul className="benchmark-list">
        {keys.map((key) => {
          const benchmarkLabel = benchmarkLabels[key] ?? key;
          const coverage = benchmarkCoverage(models, key);
          const coverageLabel = benchmarkCoverageLabel(coverage);
          return (
            <li key={key}>
              <button
                className="benchmark-chip"
                type="button"
                data-hovered={hoveredBenchmarkKey === key ? "true" : undefined}
                aria-label={`${benchmarkLabel}, ${coverageAriaLabel(coverage)}, ${isFrontier ? "frontier" : "baseline"} benchmark`}
                onMouseEnter={(event) => onHover(event, key)}
                onFocus={(event) => onHover(event, key)}
                onMouseLeave={onHoverEnd}
                onBlur={onHoverEnd}
              >
                {isFrontier && (
                  <Star className="benchmark-frontier-star" aria-hidden="true" size={10} />
                )}
                <span className="benchmark-chip-label">{benchmarkLabel}</span>
                <span className="benchmark-chip-coverage">{coverageLabel}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function coverageAriaLabel(coverage: ReturnType<typeof benchmarkCoverage>): string {
  return coverage.total === 0
    ? "no models in current view"
    : `${benchmarkCoverageLabel(coverage)} coverage in current model view`;
}

function LoadingBenchmarkList({ label }: { label: string }) {
  const prefix = label.toLowerCase();
  const count = loadingCounts[label] ?? 5;
  const keys = Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
  return (
    <ul className="benchmark-list benchmark-list-loading">
      {keys.map((key, index) => (
        <li key={key}>
          <span
            className="benchmark-chip benchmark-chip-loading"
            style={
              {
                "--loading-chip-index": index,
              } as CSSProperties
            }
          />
        </li>
      ))}
    </ul>
  );
}
