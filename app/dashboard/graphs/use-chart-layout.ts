"use client";

/** Measure dashboard chart widths and follow the shared compact-layout breakpoint, except while a saved image redraws a surface's plots at the image's own width. */

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { useMediaQuery } from "../shared/use-media-query";

const COMPACT_CHART_MEDIA_QUERY = "(max-width: 820px)";
const CAPTURE_PLOT_SELECTOR = "[data-capture-plot]";

// Set only inside `redrawPlotsForCapture`: the plots under `root` draw at `width` with the full layout.
let capturePlot: { root: HTMLElement; width: number } | null = null;
const capturePlotListeners = new Set<() => void>();

/**
 * Match SVG coordinates to displayed pixels so resizing reflows the plot without scaling its typography; `compact` follows the shared compact-chart boundary.
 * The element given `chartRef` is the plot's host, marked `data-capture-plot` so a saved image can redraw it.
 */
export function useChartLayout(maxWidth: number) {
  const [host, chartRef] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(maxWidth);
  useLayoutEffect(() => {
    if (!host) return;
    const measure = () => {
      const measured = Math.min(maxWidth, host.clientWidth);
      if (measured > 0) setWidth(measured);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host, maxWidth]);
  const captureWidth = useSyncExternalStore(
    subscribeCapturePlot,
    () => (host != null && capturePlot?.root.contains(host) ? capturePlot.width : null),
    () => null,
  );
  const compact = useMediaQuery(COMPACT_CHART_MEDIA_QUERY);
  return {
    chartRef,
    width: Math.min(maxWidth, captureWidth ?? width),
    compact: compact && captureWidth == null,
  };
}

/**
 * Redraw the plots of `live` for its copy staged as a saved image, instead of magnifying the page's plots: they draw at the staged plots' width with the full layout for one synchronous render, their marks and sky pixels replace the staged copies, and the page returns to its own layout before the browser paints.
 * `live` carries the image's layout mark for that render, so labels are measured at the type sizes the image sets them in.
 */
export function redrawPlotsForCapture(staged: HTMLElement, live: HTMLElement): void {
  const plots = live.querySelectorAll(CAPTURE_PLOT_SELECTOR);
  const stagedPlots = staged.querySelectorAll(CAPTURE_PLOT_SELECTOR);
  if (stagedPlots.length === 0 || plots.length !== stagedPlots.length) return;
  live.dataset.captureLayout = "artifact";
  setCapturePlot({ root: live, width: stagedPlots[0]!.clientWidth });
  stagedPlots.forEach((host, index) => {
    const plot = plots[index]!;
    host.replaceChildren(...Array.from(plot.children, (mark) => mark.cloneNode(true)));
    // A cloned canvas comes out blank, so a chart's sky is copied in while its redraw is still in the drawing buffer.
    const skies = plot.querySelectorAll("canvas");
    host.querySelectorAll("canvas").forEach((copy, sky) => {
      const source = skies[sky];
      const context = copy.getContext("2d");
      if (source == null || context == null) return;
      // The sky's light adds onto what lies behind it, which a PNG cannot carry as translucency, so the copy lays it onto that surface first.
      context.fillStyle = surfaceBehind(source);
      context.fillRect(0, 0, copy.width, copy.height);
      context.drawImage(source, 0, 0);
    });
  });
  delete live.dataset.captureLayout;
  setCapturePlot(null);
}

/** The background of the nearest ancestor that paints one. */
function surfaceBehind(element: Element): string {
  for (let node = element.parentElement; node != null; node = node.parentElement) {
    const color = window.getComputedStyle(node).backgroundColor;
    if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
  }
  return "transparent";
}

function setCapturePlot(next: typeof capturePlot): void {
  capturePlot = next;
  flushSync(() => {
    for (const listener of capturePlotListeners) listener();
  });
}

function subscribeCapturePlot(listener: () => void) {
  capturePlotListeners.add(listener);
  return () => {
    capturePlotListeners.delete(listener);
  };
}
