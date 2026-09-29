/** Render author-selected score labels with shared icons, inheriting surrounding Markdown emphasis and link decoration. */

import { type ReactNode } from "react";

import { BotIcon, BrainIcon, DollarIcon, LightningIcon } from "../dashboard/shared/DashboardIcons";
import { scoreMarkers, type ScoreName } from "./score-markers";

import styles from "./methodology.module.css";

const scoreIcons = {
  Intelligence: BrainIcon,
  Agentic: BotIcon,
  Speed: LightningIcon,
  Value: DollarIcon,
};

/** Preserve plain words and replace only explicit :score[...] annotations, including in source-derived navigation labels. */
export function ScoreText({ children: text }: { children: string }) {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const { index, end, score } of scoreMarkers(text)) {
    parts.push(text.slice(offset, index));
    parts.push(<ScoreLabel score={score} key={index} />);
    offset = end;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}

/** The icon is decorative; the original score name remains the accessible text and part of its surrounding link. */
export function ScoreLabel({ score }: { score: ScoreName }) {
  const Icon = scoreIcons[score];
  return (
    <span className={styles.scoreMention} data-score={score}>
      <Icon />
      {score}
    </span>
  );
}
