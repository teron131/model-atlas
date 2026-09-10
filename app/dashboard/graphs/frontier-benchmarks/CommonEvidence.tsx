/** Compact evidence disclosure explains compared variants, common tasks, and residual index weight without owning graph selection. */

import { ProviderLogo } from "../../shared/ProviderLogo";
import {
  frontierBenchmarkAxisConfig,
  type FrontierBenchmarkAxisKey,
  type FrontierBenchmarkOption,
  isScoreAxis,
} from "./analysis";
import type { CommonBenchmarkComparison } from "./common-evidence";

import styles from "../graphs.module.css";

export function CommonEvidence({
  comparison,
  benchmarkOptions,
  activeBenchmarkKeys,
  axisKey,
  publishedPerformance,
  showVariants,
}: {
  comparison: CommonBenchmarkComparison;
  benchmarkOptions: readonly FrontierBenchmarkOption[];
  activeBenchmarkKeys: readonly string[];
  axisKey: FrontierBenchmarkAxisKey;
  publishedPerformance: boolean;
  showVariants: boolean;
}) {
  const shares = comparison.groups
    .filter((group) => group.effortCount > 0)
    .map((group) => group.indexShare * 100);
  const indexShareLabel =
    shares.length === 0
      ? null
      : Math.min(...shares).toFixed(0) === Math.max(...shares).toFixed(0)
        ? `${Math.min(...shares).toFixed(0)}%`
        : `${Math.min(...shares).toFixed(0)}–${Math.max(...shares).toFixed(0)}%`;
  const resourceLabel = axisKey === "cost" ? "cost" : axisKey === "time" ? "time" : "token-use";
  const label = (key: string) =>
    key === "aa_intelligence_index"
      ? "AA Index"
      : (benchmarkOptions.find((option) => option.key === key)?.label ?? key).replace(
          " (index)",
          "",
        );
  return (
    <details className={styles.commonEvidence} aria-label="Common evidence">
      <summary className={styles.chartFooterCaption}>
        <span>Common within model</span>
        <span>
          {comparison.rows.length} {showVariants ? "variants" : "models"}
        </span>
        {indexShareLabel != null ? <span>Index {indexShareLabel}</span> : null}
        <span>Details</span>
      </summary>
      <div className={styles.note}>
        <p>
          {publishedPerformance
            ? `Each model's variants share ${resourceLabel} evidence; Y keeps the published score.`
            : isScoreAxis(axisKey)
              ? `Each model's variants share performance evidence; X keeps the published ${frontierBenchmarkAxisConfig[axisKey].label}.`
              : `Each model's variants share quality and ${resourceLabel} evidence, with the same weights on both axes.`}
        </p>
        {comparison.indexVariantCount > 0 ? (
          <p>AA weight excludes separately counted components.</p>
        ) : null}
        {comparison.excludedVariantCount > 0 ? (
          <p>{`${comparison.excludedVariantCount} variants lack selected index results. Deselect indexes to compare tasks.`}</p>
        ) : null}
        {comparison.groups.length > 0 ? (
          <div
            className={styles.evidenceTableWrap}
            role="region"
            aria-label="Evidence by model"
            tabIndex={0}
          >
            <table className={styles.evidenceTable}>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Variants</th>
                  <th scope="col">Common</th>
                  <th scope="col">Index</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {comparison.groups.map((group) => {
                  const missingKeys = activeBenchmarkKeys.filter(
                    (key) => !group.benchmarkKeys.includes(key),
                  );
                  return (
                    <tr key={group.modelKey}>
                      <th scope="row">
                        <div className={styles.evidenceModel}>
                          <ProviderLogo model={group.model} />
                          <span>{group.model.name ?? group.model.id ?? "Unknown model"}</span>
                        </div>
                      </th>
                      <td>{group.effortCount}</td>
                      <td>
                        {group.benchmarkKeys.length}/{activeBenchmarkKeys.length}
                      </td>
                      <td>{(group.indexShare * 100).toFixed(0)}%</td>
                      <td>
                        <span>{group.benchmarkKeys.map(label).join(", ") || "None"}</span>
                        {missingKeys.length > 0 ? (
                          <details className={styles.missingEvidence}>
                            <summary>Not common ({missingKeys.length})</summary>
                            <p>{missingKeys.map(label).join(", ")}</p>
                            <p>{`${isScoreAxis(axisKey) ? "Missing performance evidence" : `Missing paired quality and ${resourceLabel} data`} for some shown variants.`}</p>
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {comparison.groups.length === 0 ? (
          <p>No common evidence. Select a model or one benchmark.</p>
        ) : null}
      </div>
    </details>
  );
}
