"use client";

/** Measure dashboard chart widths and follow the shared compact-layout breakpoint. */

import { useLayoutEffect, useState } from "react";

import { useMediaQuery } from "../shared/use-media-query";

const COMPACT_CHART_MEDIA_QUERY = "(max-width: 820px)";

/** Match SVG coordinates to displayed pixels so resizing reflows the plot without scaling its typography. */
export function useChartWidth(maxWidth: number) {
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
  return { chartRef, width };
}

/** Follow the shared compact-chart boundary without changing the server render. */
export function useCompactChartLayout(): boolean {
  return useMediaQuery(COMPACT_CHART_MEDIA_QUERY);
}
