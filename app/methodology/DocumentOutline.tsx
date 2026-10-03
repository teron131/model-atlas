"use client";

/** Scroll-synchronized navigation tree for the active methodology document, drawn as the dashboard rail's flight path turned vertical. */

import { useEffect, useRef, useState } from "react";

import { clamp01 } from "../../src/model-atlas/math-utils";
import type { TableOfContentsItem } from "./documents";
import { ScoreText } from "./ScoreText";

import styles from "./methodology.module.css";

// A heading counts as reached once it rises past this share of the viewport.
const ACTIVATION_LINE = 0.22;
// Each waypoint sits on the rail beside its link's first text line.
const WAYPOINT_OFFSET = 16;
// Over this share of the final viewport of scroll, the star glides on to the last section.
const FINISH_SHARE = 0.5;

/**
 * The star travels the outline rail continuously with the scroll, from waypoint to waypoint as each heading reaches the activation line, and rests on the last section at the page's scroll limit.
 * Positions are written as CSS variables on the rail, so scrolling never re-renders the outline; only crossing a heading updates the current section.
 */
export function DocumentOutline({ items }: { items: TableOfContentsItem[] }) {
  const outlineRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const rail = railRef.current;
    const headings = items.flatMap((item) => {
      const heading = document.getElementById(item.id);
      return heading == null ? [] : [heading];
    });
    if (rail == null || headings.length === 0) {
      return;
    }
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const links = Array.from(rail.querySelectorAll<HTMLAnchorElement>("a"));
      if (links.length !== headings.length) return;
      const line = window.innerHeight * ACTIVATION_LINE;
      const offsets = headings.map((heading) => heading.getBoundingClientRect().top - line);
      const waypoints = links.map((link) => link.offsetTop + WAYPOINT_OFFSET);
      const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      const last = offsets.length - 1;
      let reached = -1;
      while (reached < last && offsets[reached + 1]! <= 0) reached += 1;
      const natural =
        reached === -1
          ? waypoints[0]!
          : reached === last
            ? waypoints[last]!
            : waypoints[reached]! +
              (waypoints[reached + 1]! - waypoints[reached]!) *
                clamp01(-offsets[reached]! / (offsets[reached + 1]! - offsets[reached]!));
      // Short final sections never reach the line, so the last half-screen of scroll carries the star on to the last section.
      const finish = clamp01(1 - remaining / (window.innerHeight * FINISH_SHARE));
      if (remaining <= 1) reached = last;
      const position = natural + (waypoints[last]! - natural) * finish;
      rail.style.setProperty("--outline-star", `${position.toFixed(1)}px`);
      links.forEach((link, index) => {
        link.dataset.reached = String(index <= reached);
      });
      setActiveId(items[Math.max(0, reached)]!.id);
    };
    const schedule = () => {
      if (frame == null) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  useEffect(() => {
    const navigation = outlineRef.current?.closest<HTMLElement>("#document-navigation");
    const activeLink = outlineRef.current?.querySelector<HTMLAnchorElement>(
      `a[href="#${CSS.escape(activeId)}"]`,
    );
    if (
      navigation == null ||
      activeLink == null ||
      navigation.scrollHeight <= navigation.clientHeight
    ) {
      return;
    }
    // Follow the reader inside the desktop sidebar without scrolling any ancestor, especially the mobile page.
    const linkBounds = activeLink.getBoundingClientRect();
    const top = navigation.getBoundingClientRect().top + navigation.clientTop;
    const bottom = top + navigation.clientHeight;
    if (linkBounds.top < top) navigation.scrollTop += linkBounds.top - top;
    else if (linkBounds.bottom > bottom) navigation.scrollTop += linkBounds.bottom - bottom;
  }, [activeId]);

  return (
    <nav className={styles.outline} aria-label="On this page" ref={outlineRef}>
      <p className={styles.railLabel}>On this page</p>
      <ol ref={railRef}>
        {items.map((item) => (
          <li key={item.id} data-level={item.level}>
            <a href={`#${item.id}`} aria-current={item.id === activeId ? "location" : undefined}>
              <ScoreText>{item.label}</ScoreText>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
