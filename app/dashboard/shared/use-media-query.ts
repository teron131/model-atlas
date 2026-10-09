"use client";

/** Follow a CSS media query on the client, starting unmatched so the server render and hydration agree. */

import { useEffect, useState } from "react";

/** Whether `query` matches, updated as the viewport crosses it; `false` until the first client effect. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}
