/** Shared dashboard marks render scores, resource ratios, input modalities, and capture controls without depending on table or sheet layout. */

import {
  AudioLines,
  BrainCircuit,
  Camera,
  CircleDollarSign,
  FileText,
  Image as ImageSymbol,
  Video,
  Zap,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { RiRobot3Line } from "react-icons/ri";

import type { ModelAtlasScoreDimension } from "../../../src/model-atlas/stats/types";
import { ratioTrackStyle } from "./resource-ratio-display";

export function BrainIcon() {
  return <BrainCircuit aria-hidden="true" />;
}

export function BotIcon() {
  return <RiRobot3Line aria-hidden="true" style={{ fill: "currentColor", stroke: "none" }} />;
}

export function LightningIcon() {
  return <Zap aria-hidden="true" />;
}

export function DollarIcon() {
  return <CircleDollarSign aria-hidden="true" />;
}

/** The mark each published score carries wherever it is named. */
export const SCORE_ICONS = {
  intelligence: BrainIcon,
  agentic: BotIcon,
  speed: LightningIcon,
  value: DollarIcon,
} as const satisfies Record<ModelAtlasScoreDimension, ComponentType>;

export function ScreenshotIcon() {
  return <Camera aria-hidden="true" />;
}

function TextInputIcon() {
  return <FileText aria-hidden="true" />;
}

function ImageInputIcon() {
  return <ImageSymbol aria-hidden="true" />;
}

function AudioInputIcon() {
  return <AudioLines aria-hidden="true" />;
}

function VideoInputIcon() {
  return <Video aria-hidden="true" />;
}

const inputModalities = [
  { key: "text", label: "text", Icon: TextInputIcon },
  { key: "image", label: "image", Icon: ImageInputIcon },
  { key: "audio", label: "audio", Icon: AudioInputIcon },
  { key: "video", label: "video", Icon: VideoInputIcon },
] as const;

/** The input modalities as one mark each, dimmed where the model lacks it, read aloud as `prefix` and the available list. */
export function ModalityIcons({
  inputs,
  prefix = "",
}: {
  inputs: string[] | undefined;
  prefix?: string;
}) {
  const available = new Set((inputs ?? []).map((input) => input.toLowerCase()));
  const label = `${prefix}${
    inputModalities
      .filter(({ key }) => available.has(key))
      .map(({ label }) => label)
      .join(", ") || "none"
  }`;
  return (
    <span className="modality-icons" title={label}>
      <span className="visually-hidden">{label}</span>
      {inputModalities.map(({ Icon, key, label }) => (
        <span
          key={key}
          className={`modality-icon ${available.has(key) ? "" : "unavailable"}`}
          title={`${label} input is ${available.has(key) ? "available" : "unavailable"}`}
          aria-hidden="true"
        >
          <Icon />
        </span>
      ))}
    </span>
  );
}

/** The median-relative bar for a drawable ratio, in the row's provider colour unless `color` gives one. */
export function RatioTrack({ ratio, color }: { ratio: number; color?: string }) {
  const style: CSSProperties & { "--row-provider"?: string } =
    color == null ? ratioTrackStyle(ratio) : { ...ratioTrackStyle(ratio), "--row-provider": color };
  return <span className="ratio-track" style={style} aria-hidden="true" />;
}

/** The 0–100 score track with the provider star at `score`, drawn in `color`. */
export function ScoreMeter({ score, color }: { score: number; color: string | undefined }) {
  return <span className="score-meter" style={scoreMeterStyle(score, color)} aria-hidden="true" />;
}

export function scoreMeterStyle(
  score: number,
  color: string | undefined,
): CSSProperties & { "--score": string; "--score-color": string | undefined } {
  return {
    "--score": String(Math.max(0, Math.min(100, score))),
    "--score-color": color,
  };
}
