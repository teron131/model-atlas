"use client";

/** A chart's readout: one quiet line between its controls and its plot that names the model under the pointer, or else the model the chart rests on, in place of a floating card that would cover the stars. Its height holds whichever model it names, so the plot beneath never moves. */

import { ArrowUpRight } from "lucide-react";
import { type CSSProperties, Fragment } from "react";

import styles from "./graphs.module.css";

/** A fact in plain words; a labelled fact shows only its value, and screen readers hear the label before it; a versus fact sets another model against the readout's own, as a score between the two names with the opponent weighted like the readout's model, and its detail goes on in plain words after the opponent. */
export type ReadoutFact =
  | string
  | { label: string; value: string }
  | { score: string; opponent: { name: string; logo: string }; detail: string };

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
  const isSentence = entry?.facts.some((fact) => typeof fact === "object" && "opponent" in fact);
  return (
    <div
      className={isSentence ? `${styles.readout} ${styles.readoutSentence}` : styles.readout}
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
                  ) : "opponent" in fact ? (
                    <>
                      <span className={styles.readoutScore}>{fact.score}</span>{" "}
                      <span className={styles.readoutOpponent}>
                        {fact.opponent.logo ? (
                          <img
                            className={`provider-logo ${styles.readoutLogo} ${styles.readoutFactLogo}`}
                            src={fact.opponent.logo}
                            alt=""
                            width={14}
                            height={14}
                          />
                        ) : null}
                        <strong>{fact.opponent.name}</strong>
                      </span>{" "}
                      {fact.detail}
                    </>
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
