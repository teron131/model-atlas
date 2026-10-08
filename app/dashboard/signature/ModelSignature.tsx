"use client";

/** The hero opens on the frontier sky: displayed models rise as stars over the horizon above the title and the frontier register, and choosing a star or a role opens its model sheet. */

import { ArrowRight, ArrowUp } from "lucide-react";
import dynamic from "next/dynamic";
import { type CSSProperties, memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { openModelSheet } from "../model-sheet/open";
import { BotIcon, BrainIcon, DollarIcon } from "../shared/DashboardIcons";
import { formatCost } from "../table/format";
import {
  type SignatureMetric,
  signatureModels,
  type SignaturePopulation,
  signatureStars,
} from "./models";

import styles from "./signature.module.css";

const FrontierField = dynamic(
  () => import("./FrontierField").then((module) => module.FrontierField),
  { ssr: false },
);
// The horizon rests just under the title, this share of its type size below the title's line box.
const HORIZON_GAP = 0.1;

/**
 * The hero's fixed field layers sit in the dashboard's stacking context, so the hero must not create one of its own.
 *
 * The hero owns where the horizon sits: it measures the title at rest and hands that line to both the CSS atmosphere and the WebGL sky.
 */
export const ModelSignature = memo(function ModelSignature(population: SignaturePopulation) {
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<number | null>(null);
  const signatureModelRows = useMemo(
    () =>
      signatureModels(population).map((model) => ({
        ...model,
        metric: selectionMetricPresentation(model.metric),
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

  // The title moves whenever the viewport or the key and register below it change size.
  useLayoutEffect(() => {
    const hero = heroRef.current;
    const title = titleRef.current;
    if (hero == null || title == null) return;
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(title).fontSize) * HORIZON_GAP;
      setHorizon(Math.round(title.getBoundingClientRect().bottom + window.scrollY + gap));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(hero);
    for (const row of Array.from(hero.children)) observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={heroRef}
      className={styles.signature}
      style={horizon == null ? undefined : ({ "--horizon": `${horizon}px` } as CSSProperties)}
      aria-labelledby="model-signature-title"
    >
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <FrontierField
        stars={stars}
        focusKey={focusKey}
        horizon={horizon}
        heroRef={heroRef}
        onSelectStar={(family) => {
          const model = population.models.find(
            (candidate) => canonicalModelKey(candidate) === family,
          );
          if (model != null) openModelSheet({ ...model, reasoning_effort: null });
        }}
      />
      <h2 ref={titleRef} id="model-signature-title" className={styles.title}>
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
            {/* The whole role opens its model sheet; focus lights the role's star like hovering does. */}
            <button
              type="button"
              className={styles.registerOpen}
              aria-label={`Show details for ${model.name}, ${model.role}`}
              aria-haspopup="dialog"
              onClick={() => openModelSheet(model.sheet)}
              onFocus={() => setFocusKey(model.family)}
              onBlur={() => setFocusKey(null)}
            />
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
function selectionMetricPresentation(metric: SignatureMetric) {
  const score = metric.score.toFixed(1);
  const parts: SelectionMetricPart[] = [{ kind: metric.kind }, { kind: "text", value: score }];
  let accessible = `${metric.kind === "agentic" ? "Agentic" : "Intelligence"} ${score}`;
  if (metric.value != null) {
    const value = metric.value.toFixed(1);
    parts.push({ kind: "value" }, { kind: "text", value });
    accessible += ` · Value ${value}`;
  }
  const price = metric.price == null ? undefined : formatCost(metric.price);
  return {
    parts,
    price,
    accessible:
      price == null ? accessible : `${accessible} · Blended price ${price} per million tokens`,
  };
}
