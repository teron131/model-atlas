"use client";

/** The hero opens on the frontier sky: displayed models rise as stars over the horizon above the title and the frontier register. */

import { ArrowRight, ArrowUp } from "lucide-react";
import dynamic from "next/dynamic";
import { type CSSProperties, memo, useMemo, useRef, useState } from "react";

import { BotIcon, BrainIcon, DollarIcon } from "../shared/DashboardIcons";
import { signatureModels, type SignaturePopulation, signatureStars } from "./models";

import styles from "./signature.module.css";

const FrontierField = dynamic(
  () => import("./FrontierField").then((module) => module.FrontierField),
  { ssr: false },
);

/** The hero's fixed field layers sit in the dashboard's stacking context, so the hero must not create one of its own. */
export const ModelSignature = memo(function ModelSignature(population: SignaturePopulation) {
  const heroRef = useRef<HTMLElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const signatureModelRows = useMemo(
    () =>
      signatureModels(population).map((model) => ({
        ...model,
        metric: selectionMetricPresentation(model.selectionMetric),
      })),
    [population.models, population.paretoModels, population.referenceModels],
  );
  const stars = useMemo(
    () =>
      signatureStars(
        population.models,
        population.referenceModels,
        new Map(signatureModelRows.map((model) => [model.family, model.name])),
      ),
    [population.models, population.referenceModels, signatureModelRows],
  );

  return (
    <section ref={heroRef} className={styles.signature} aria-labelledby="model-signature-title">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <FrontierField stars={stars} focusKey={focusKey} heroRef={heroRef} />
      <h2 id="model-signature-title" className={styles.title}>
        <span className={styles.titleStart}>Mapping</span>{" "}
        <span className={styles.titleEnd}>Frontiers</span>
      </h2>
      {/* The key states how the decorative sky maps scores, like the legend on a star chart. */}
      <ul className={styles.skyKey} aria-hidden="true" hidden={stars.length === 0}>
        <li>
          <span className={styles.keyStar} />
          Each star is a model
        </li>
        <li>
          <ArrowUp />
          Higher is more intelligent
        </li>
        <li>
          <ArrowRight />
          Further right is newer
        </li>
        <li>
          <span className={styles.keyRays} />
          Stars with rays hold frontier roles
        </li>
      </ul>
      <ol className={styles.register} aria-label="Frontier roles">
        {signatureModelRows.map((model) => (
          <li
            className={styles.registerItem}
            key={model.key}
            style={{ "--provider": model.color } as CSSProperties}
            data-focused={focusKey === model.family}
            onPointerEnter={() => setFocusKey(model.family)}
            onPointerLeave={() => setFocusKey(null)}
          >
            <span className={styles.registerRole}>{model.role}</span>
            <span className={styles.registerModel}>
              <span className={styles.registerIcon} aria-hidden="true">
                {model.logo ? <img src={model.logo} alt="" width={18} height={18} /> : null}
              </span>
              <strong>{model.name}</strong>
            </span>
            <span className={styles.registerMetric}>
              <span className="visually-hidden">{model.metric.accessible}</span>
              <span className={styles.registerMetricVisual} aria-hidden="true">
                {model.metric.parts.map((part, index) =>
                  part.kind === "text" ? (
                    <span key={`${part.value}-${index}`}>{part.value}</span>
                  ) : (
                    <span className={styles.registerMetricIcon} key={`${part.kind}-${index}`}>
                      {part.kind === "intelligence" ? (
                        <BrainIcon />
                      ) : part.kind === "agentic" ? (
                        <BotIcon />
                      ) : (
                        <DollarIcon />
                      )}
                    </span>
                  ),
                )}
                {model.metric.price != null ? (
                  <span className={styles.registerPrice} title="Blended price per million tokens">
                    {model.metric.price}
                  </span>
                ) : null}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
});

type SelectionMetricPart =
  | { kind: "agentic" | "intelligence" | "value" }
  | { kind: "text"; value: string };

/** Keep the register's visual metric and its accessible label on one score-and-price presentation. */
function selectionMetricPresentation(metric: string) {
  const [scores = "", blendedPrice] = metric.split(" · BLEND ");
  const price = blendedPrice?.replace("/M", "");
  const metricKind = scores.startsWith("AGT ") ? "agentic" : "intelligence";
  const withoutPrefix = scores.replace(/^(?:AGT|INT) /, "");
  const valueStart = withoutPrefix.indexOf(" · VAL ");
  const parts: SelectionMetricPart[] = [
    { kind: metricKind },
    { kind: "text", value: valueStart === -1 ? withoutPrefix : withoutPrefix.slice(0, valueStart) },
  ];
  if (valueStart !== -1) {
    parts.push({ kind: "value" }, { kind: "text", value: withoutPrefix.slice(valueStart + 7) });
  }
  const accessibleScores = scores
    .replace(/^INT /, "Intelligence ")
    .replace(/^AGT /, "Agentic ")
    .replace(" · VAL ", " · Value ");
  return {
    parts,
    price,
    accessible:
      price == null
        ? accessibleScores
        : `${accessibleScores} · Blended price ${price} per million tokens`,
  };
}
