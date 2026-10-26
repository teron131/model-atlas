/** Decorative icon marks shared by the dashboard and the methodology: the four score marks, input modalities, and capture. */

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
import type { ComponentType } from "react";
import { RiRobot3Line } from "react-icons/ri";

import type { ModelAtlasScoreDimension } from "../../../src/model-atlas/stats/types";

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

export function TextInputIcon() {
  return <FileText aria-hidden="true" />;
}

export function ImageInputIcon() {
  return <ImageSymbol aria-hidden="true" />;
}

export function AudioInputIcon() {
  return <AudioLines aria-hidden="true" />;
}

export function VideoInputIcon() {
  return <Video aria-hidden="true" />;
}
