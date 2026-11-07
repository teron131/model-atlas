"use client";

/** The hero opens on the frontier sky: displayed models rise as stars over the horizon above the title and the frontier register, and choosing a star or a role opens its model sheet. */

import dynamic from "next/dynamic";
import { type CSSProperties, memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { openModelSheet } from "../model-sheet/open";
import { SCORE_ICONS } from "../shared/DashboardMarks";
import { formatCost } from "../table/format";
import {
  type SignatureMetric,
  signatureModels,
  type SignaturePopulation,
  signatureStars,
} from "./models";

import styles from "./signature.module.css";

// Server-render the field's markup so its graphics chunk loads with the page; WebGL still starts only in the client effect.
// Keep a separate loading boundary so the dashboard can hydrate while the graphics module loads.
const FrontierField = dynamic(
  () => import("./FrontierField").then((module) => module.FrontierField),
  { loading: () => null },
);
// The horizon rests under the title as laid out: this share of its type size below the title's line box, or this share of the open sky down to the register when a tall hero leaves more.
const HORIZON_GAP = 0.1;
const HORIZON_SPACE_SHARE = 0.15;
// Over the live sky the title is drawn lower, until the rim crosses its second line this share of the type size above the line box's foot, so the planet hides about a third of the capitals.
const TITLE_SET = 0.4;

/**
 * The hero's fixed field layers sit in the dashboard's stacking context, so the hero must not create one of its own.
 *
 * The hero owns where the horizon sits: it measures the title at rest and hands that line to both the CSS atmosphere and the WebGL sky, along with how far the title drops to set into the rim.
 */
export const ModelSignature = memo(function ModelSignature(population: SignaturePopulation) {
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{ horizon: number; sink: number } | null>(null);
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

  // The title moves whenever the viewport or the register below it changes size.
  useLayoutEffect(() => {
    const hero = heroRef.current;
    const title = titleRef.current;
    if (hero == null || title == null) return;
    const measure = () => {
      // Layout offsets rather than the box on screen, which the drop into the rim moves.
      const bottom = hero.getBoundingClientRect().top + title.offsetTop + title.offsetHeight;
      // The first row shown below the title.
      let next = title.nextElementSibling;
      while (next != null && next.getClientRects().length === 0) next = next.nextElementSibling;
      const open = (next?.getBoundingClientRect().top ?? bottom) - bottom;
      const size = Number.parseFloat(getComputedStyle(title).fontSize);
      const gap = Math.max(size * HORIZON_GAP, open * HORIZON_SPACE_SHARE);
      setPlacement({
        horizon: Math.round(bottom + window.scrollY + gap),
        sink: Math.round(gap + size * TITLE_SET),
      });
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
      style={
        placement == null
          ? undefined
          : ({
              "--horizon": `${placement.horizon}px`,
              "--title-sink": `${placement.sink}px`,
            } as CSSProperties)
      }
      aria-labelledby="model-signature-title"
      aria-busy={population.referenceModels.length === 0}
    >
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <FrontierField
        stars={stars}
        focusKey={focusKey}
        horizon={placement?.horizon ?? null}
        heroRef={heroRef}
        onSelectStar={(family) => {
          const model = population.models.find(
            (candidate) => canonicalModelKey(candidate) === family,
          );
          if (model != null) openModelSheet({ ...model, reasoning_effort: null });
        }}
      />
      <h2 ref={titleRef} id="model-signature-title" className={styles.title}>
        <span className={styles.titleStart}>Sidereal</span>{" "}
        <span className={styles.titleEnd}>Horizon</span>
      </h2>
      <ol className={styles.register} aria-label="Frontier roles">
        {signatureModelRows.map((model) => (
          <li
            className={styles.registerItem}
            key={model.family}
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
                {model.metric.scores.map(({ kind, text }) => {
                  const Icon = SCORE_ICONS[kind];
                  return (
                    <span className={styles.registerScore} key={kind}>
                      <Icon />
                      {text}
                    </span>
                  );
                })}
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

const METRIC_SCORES = [
  ["intelligence", "Intelligence"],
  ["agentic", "Agentic"],
  ["value", "Value"],
] as const;

/** Keep the register's visual metric and its accessible label on one score-and-price presentation. */
function selectionMetricPresentation(metric: SignatureMetric) {
  const scores = METRIC_SCORES.flatMap(([kind, label]) => {
    const score = metric[kind];
    return score == null ? [] : [{ kind, label, text: score.toFixed(1) }];
  });
  const accessible = scores.map(({ label, text }) => `${label} ${text}`).join(" · ");
  const price = metric.price == null ? undefined : formatCost(metric.price);
  return {
    scores,
    price,
    accessible:
      price == null ? accessible : `${accessible} · Blended price ${price} per million tokens`,
  };
}
