"use client";

/** The dashboard's research regions: the pinned rail that indexes them and follows the reader, and the frame each region opens with, its index ordinal and name on the sky over one opaque plane. */

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { clamp01 } from "../../src/model-atlas/math-utils";
import { CaptureButton } from "./capture/CaptureButton";
import { ARTIFACT_WIDTH } from "./capture/png";
import { CopyDashboardLink } from "./CopyDashboardLink";
import { RESEARCH_REGION_IDS, researchRegion, type ResearchRegionId } from "./research-index";
import { dashboardUrlSection } from "./url-state";

import styles from "./research-regions.module.css";

// The journey track starts and ends this far inside the first and last region links.
const JOURNEY_INSET = 13;

/**
 * The rail pins to the viewport top so the region index and the global controls in `children` stay reachable from any region.
 * Its height is published as `--dashboard-rail-height` on its parent, so region anchors and the leaderboard's pinned header clear it.
 */
export function ResearchRail({ children }: { children: ReactNode }) {
  const railRef = useRef<HTMLElement>(null);
  const indexRef = useRef<HTMLElement>(null);
  const currentRegion = useCurrentResearchRegion(indexRef);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const atlas = rail?.parentElement;
    if (!rail || !atlas) return;
    const measure = () =>
      atlas.style.setProperty(
        "--dashboard-rail-height",
        `${Math.ceil(rail.getBoundingClientRect().height)}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => {
      observer.disconnect();
      atlas.style.removeProperty("--dashboard-rail-height");
    };
  }, []);

  return (
    <section ref={railRef} className={styles.rail} aria-label="Global view">
      <div className={styles.bar}>
        <nav ref={indexRef} className={styles.index} aria-label="Dashboard sections">
          <span className={styles.journeyStar} aria-hidden="true" />
          {RESEARCH_REGION_IDS.map((id) => {
            const { label, ordinal } = researchRegion(id);
            return (
              <a
                href={`#${id}`}
                key={id}
                aria-current={id === currentRegion ? "location" : undefined}
              >
                <b aria-hidden="true">{ordinal}</b>
                {label}
              </a>
            );
          })}
        </nav>
        {children}
      </div>
    </section>
  );
}

/**
 * A region opens with the ordinal and name the rail gives it, then its actions: save an image and copy a link to the region.
 * A figure region's image is its own frame, named by `capture.title`; a region that renders a separate image supplies its own `capture.action`.
 */
export function ResearchRegion({
  id,
  className,
  plane,
  capture,
  children,
}: {
  id: ResearchRegionId;
  className?: string;
  plane?: string;
  capture: { title: string; fileName: string } | { action: ReactNode };
  children: ReactNode;
}) {
  const regionRef = useRef<HTMLElement>(null);
  const titleId = `${id}-title`;
  const { label, ordinal } = researchRegion(id);
  return (
    <section
      id={id}
      ref={regionRef}
      className={
        className == null ? "dashboard-research-section" : `dashboard-research-section ${className}`
      }
      aria-labelledby={titleId}
    >
      <header className="dashboard-section-head">
        <h2 id={titleId} className="dashboard-section-title">
          <b aria-hidden="true">{ordinal}</b>
          <span>{label}</span>
        </h2>
        <div className="dashboard-section-actions" data-capture-exclude>
          {"action" in capture ? (
            capture.action
          ) : (
            <CaptureButton
              captureWidth={ARTIFACT_WIDTH}
              fileName={capture.fileName}
              targetRef={regionRef}
              title={capture.title}
            />
          )}
          <CopyDashboardLink sectionId={id} />
        </div>
      </header>
      <div className={plane == null ? "research-plane" : `research-plane ${plane}`}>{children}</div>
    </section>
  );
}

/**
 * Align deep links once the regions are on the page and report the region entering the upper viewport band.
 *
 * The same scroll frame moves the rail's journey star between the region links, written as CSS variables so scrolling never re-renders the rail.
 */
function useCurrentResearchRegion(indexRef: RefObject<HTMLElement | null>) {
  const [currentRegion, setCurrentRegion] = useState<ResearchRegionId | null>(null);

  useEffect(() => {
    const regions = RESEARCH_REGION_IDS.flatMap((id) => {
      const element = document.getElementById(id);
      return element == null ? [] : [{ element, id }];
    });
    if (regions.length === 0) {
      return;
    }
    let updateFrame: number | null = null;
    const updateCurrentRegion = () => {
      updateFrame = null;
      const activationLine = window.innerHeight * 0.45;
      const offsets = regions.map(
        (region) => region.element.getBoundingClientRect().top - activationLine,
      );
      let reached = -1;
      while (reached + 1 < offsets.length && offsets[reached + 1]! <= 0) reached += 1;
      const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (remaining <= 1) reached = regions.length - 1;
      setCurrentRegion(reached === -1 ? null : regions[reached]!.id);
      placeJourney(indexRef.current, regions, offsets, reached, remaining);
    };
    const scheduleUpdate = () => {
      if (updateFrame == null) {
        updateFrame = window.requestAnimationFrame(updateCurrentRegion);
      }
    };
    let alignmentFrame: number | null = null;
    const alignRegion = () => {
      if (alignmentFrame != null) window.cancelAnimationFrame(alignmentFrame);
      // URL-backed controls hydrate before measuring the selected region's final position.
      alignmentFrame = window.requestAnimationFrame(() => {
        alignmentFrame = window.requestAnimationFrame(() => {
          alignmentFrame = null;
          const region = dashboardUrlSection(new URL(window.location.href));
          if (region != null) document.getElementById(region)?.scrollIntoView({ block: "start" });
          scheduleUpdate();
        });
      });
    };
    alignRegion();
    window.addEventListener("popstate", alignRegion);
    window.addEventListener("hashchange", alignRegion);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      if (alignmentFrame != null) window.cancelAnimationFrame(alignmentFrame);
      window.removeEventListener("popstate", alignRegion);
      window.removeEventListener("hashchange", alignRegion);
      if (updateFrame != null) {
        window.cancelAnimationFrame(updateFrame);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
    };
  }, [indexRef]);

  return currentRegion;
}

/**
 * Place the journey star on the rail: it approaches the first region from the track start, travels link to link as each region reaches the activation line, and reaches the track end at the page's actual scroll limit.
 * Links the star has passed are marked reached so their waypoints light.
 */
function placeJourney(
  nav: HTMLElement | null,
  regions: { element: HTMLElement }[],
  offsets: number[],
  reached: number,
  remaining: number,
) {
  const links = nav == null ? [] : Array.from(nav.querySelectorAll<HTMLAnchorElement>("a"));
  const first = links[0];
  const last = links.at(-1);
  if (nav == null || first == null || last == null || links.length !== regions.length) return;
  const centres = links.map((link) => link.offsetLeft + link.offsetWidth / 2);
  const start = first.offsetLeft + JOURNEY_INSET;
  const end = last.offsetLeft + last.offsetWidth - JOURNEY_INSET;
  const lastIndex = regions.length - 1;
  let position: number;
  if (reached === -1) {
    position = start + (centres[0]! - start) * clamp01(1 - offsets[0]! / window.innerHeight);
  } else if (reached < lastIndex) {
    const span = offsets[reached + 1]! - offsets[reached]!;
    position =
      centres[reached]! +
      (centres[reached + 1]! - centres[reached]!) * clamp01(-offsets[reached]! / span);
  } else {
    const travelled = Math.max(0, -offsets[lastIndex]!);
    const travel = remaining <= 1 ? 1 : clamp01(travelled / (travelled + remaining));
    position = centres[lastIndex]! + (end - centres[lastIndex]!) * travel;
  }
  nav.style.setProperty("--journey-start", `${start}px`);
  nav.style.setProperty("--journey-end", `${end}px`);
  nav.style.setProperty("--journey", `${position.toFixed(1)}px`);
  links.forEach((link, index) => {
    link.dataset.reached = String(index <= reached);
  });
}
