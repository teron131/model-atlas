/** Shared graph view contracts. */

import type { Dispatch, SetStateAction } from "react";

export type HoverRow = readonly [string, string];

export type HoverState = {
  left: number;
  top: number;
  model: string;
  provider: string;
  color: string;
  logo: string;
  rows: HoverRow[];
};

export type HoverSetter = Dispatch<SetStateAction<HoverState | null>>;

export type Margin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
