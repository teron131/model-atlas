"use client";

/** Choice strips reveal their active item within their own horizontal viewport and expose overflow cues without moving the page. */

import { useLayoutEffect, useRef } from "react";

const ACTIVE_CHOICE =
  'button[aria-pressed="true"], summary[aria-current="true"], a[aria-current="page"]';

/** Follow selection and width changes while leaving manual sideways scrolling unrestricted. */
export function useHorizontalChoice<T extends HTMLElement>(choice: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const strip = ref.current;
    if (strip == null) return;
    const selected = strip.querySelector<HTMLElement>(ACTIVE_CHOICE);
    const updateEdges = () => {
      strip.dataset.overflowStart = String(strip.scrollLeft > 1);
      strip.dataset.overflowEnd = String(
        strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
      );
    };
    const reveal = () => {
      if (selected != null && strip.scrollWidth > strip.clientWidth) {
        const bounds = strip.getBoundingClientRect();
        const item = selected.getBoundingClientRect();
        if (item.left < bounds.left + 8) strip.scrollLeft += item.left - bounds.left - 8;
        else if (item.right > bounds.right - 8) strip.scrollLeft += item.right - bounds.right + 8;
      }
      updateEdges();
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    if (selected != null) observer.observe(selected);
    strip.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", updateEdges);
    };
  }, [choice]);

  return ref;
}
