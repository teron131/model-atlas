/** Build shared graph hover-card state from pointer and focus interactions. */

import type { PointerEvent } from "react";

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { modelLogo, modelName } from "../shared/model-display";
import { providerChartColor, providerDisplayName } from "../shared/provider-theme";
import type { HoverRow, HoverState } from "./types";

export function pointHover(
  event: PointerEvent<Element>,
  model: ModelAtlasModel,
  rows: HoverRow[],
  displayName = modelName(model),
): HoverState {
  return {
    left: event.clientX,
    top: event.clientY,
    model: displayName,
    provider: providerDisplayName(model),
    color: providerChartColor(model.provider),
    logo: modelLogo(model),
    rows,
  };
}

export function focusHover(
  target: Element,
  model: ModelAtlasModel,
  rows: HoverRow[],
  displayName = modelName(model),
): HoverState {
  const rect = target.getBoundingClientRect();
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    model: displayName,
    provider: providerDisplayName(model),
    color: providerChartColor(model.provider),
    logo: modelLogo(model),
    rows,
  };
}
