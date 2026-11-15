"use client";

/** A chart's readout: one quiet line between its controls and its plot that names the model under the pointer, or else the model the chart rests on, in place of a floating card that would cover the stars. Its height holds whichever model it names, so the plot beneath never moves. */

import { ArrowUpRight } from "lucide-react";
import { type CSSProperties, Fragment } from "react";

import styles from "./graphs.module.css";

/** A fact in plain words; a labelled fact shows only its value, and screen readers hear the label before it. */
export type ReadoutFact = string | { label: string; value: string };

export type ReadoutEntry = {
  name: string;
  logo: string;
  facts: readonly ReadoutFact[];
  /** Opens the model's sheet; absent for a model today's snapshot lacks. */
  open?: () => void;
};

export function ChartReadout({
  label,
  entry,
  factRows = 1,
}: {
  label: string;
  entry: ReadoutEntry | null;
  /** The most rows the chart's facts wrap to on a phone, one more on the narrowest, all held so the plot never moves. */
  factRows?: number;
}) {
  return (
    <div
      className={styles.readout}
      style={{ "--readout-fact-rows": factRows } as CSSProperties}
      aria-live="polite"
      aria-label={label}
    >
      {entry == null ? null : (
        <>
          {entry.logo ? (
            <img
              className={`provider-logo ${styles.readoutLogo}`}
              src={entry.logo}
              alt=""
              width={14}
              height={14}
            />
          ) : null}
          {entry.open == null ? (
            <strong className={styles.readoutName} title={entry.name}>
              {entry.name}
            </strong>
          ) : (
            <button
              type="button"
              className={styles.readoutOpen}
              aria-haspopup="dialog"
              aria-label={`Show details for ${entry.name}`}
              title={entry.name}
              onClick={entry.open}
            >
              <strong className={styles.readoutName}>{entry.name}</strong>
              <ArrowUpRight aria-hidden="true" />
            </button>
          )}
          <span className={styles.readoutFacts}>
            {entry.facts.map((fact, index) => (
              <Fragment key={index}>
                {index > 0 ? " " : null}
                <span>
                  {typeof fact === "string" ? (
                    fact
                  ) : (
                    <>
                      <span className="visually-hidden">{fact.label} </span>
                      {fact.value}
                    </>
                  )}
                  {index < entry.facts.length - 1 ? " ·" : null}
                </span>
              </Fragment>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
