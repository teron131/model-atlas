"use client";

/** Shared responsive geometry boundary for dashboard SVGs. */

import { useEffect, useState } from "react";

const COMPACT_CHART_MEDIA_QUERY = "(max-width: 820px)";

/** Follow the shared compact-chart boundary without changing the server render. */
export function useCompactChartLayout(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_CHART_MEDIA_QUERY);
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return compact;
}
