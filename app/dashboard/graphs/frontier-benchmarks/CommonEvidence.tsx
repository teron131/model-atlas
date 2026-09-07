/** Compact evidence disclosure explains the compared variants, common tasks, and residual index weight without owning graph selection. */

import { isPreviewModel } from "../../../../src/model-atlas/stats/types";
import { ProviderLogo } from "../../shared/ProviderLogo";
import type { FrontierBenchmarkAxisKey, FrontierBenchmarkOption } from "./analysis";
import type { CommonBenchmarkComparison } from "./common-evidence";

import styles from "../graphs.module.css";

export function CommonEvidence({
  comparison,
  benchmarkOptions,
  activeBenchmarkKeys,
  axisKey,
}: {
  comparison: CommonBenchmarkComparison;
  benchmarkOptions: readonly FrontierBenchmarkOption[];
  activeBenchmarkKeys: readonly string[];
  axisKey: FrontierBenchmarkAxisKey;
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
          " (index proxy)",
          "",
        );
  return (
    <details className={styles.commonEvidence} aria-label="Common evidence">
      <summary className={styles.chartFooterCaption}>
        <span>Common within model</span>
        <span>{comparison.rows.length} variants</span>
        {indexShareLabel != null ? <span>Index {indexShareLabel}</span> : null}
        <span>Details</span>
      </summary>
      <div className={styles.note}>
        <p>{`Shared quality and ${resourceLabel} evidence within each model; identical weights on both axes.`}</p>
        {comparison.indexVariantCount > 0 ? (
          <p>AA weight excludes components counted separately in this basket.</p>
        ) : null}
        {comparison.excludedVariantCount > 0 ? (
          <p>{`${comparison.excludedVariantCount} variants lack index resource data. Deselect proxies to compare their task results.`}</p>
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
                    <tr
                      key={group.modelKey}
                      className={isPreviewModel(group.model) ? "preview-row" : undefined}
                    >
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
                            <p>{`Missing paired quality and ${resourceLabel} data for some shown variants.`}</p>
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
