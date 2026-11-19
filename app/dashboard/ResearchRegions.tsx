"use client";

/** The dashboard's research regions: the pinned rail that indexes them and follows the reader, the frame each region opens with, its name on the sky over one opaque plane, and the chart a stacked region shows. */

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { clamp01 } from "../../src/model-atlas/math-utils";
import { CaptureButton } from "./capture/CaptureButton";
import { ARTIFACT_WIDTH } from "./capture/png";
import { CopyDashboardLink } from "./CopyDashboardLink";
import { redrawPlotsForCapture } from "./graphs/use-chart-layout";
import {
  isStackedRegion,
  REGION_CHARTS,
  type RegionChartKey,
  regionElement,
  RESEARCH_REGION_IDS,
  type ResearchRegionId,
  researchRegionLabel,
  type StackedRegionId,
} from "./research-index";
import {
  type DashboardSection,
  type DashboardUrlPatch,
  type DashboardUrlState,
  readDashboardUrl,
  sectionRegion,
} from "./url-state";
import { replaceDashboardUrl, showDashboardSection, useUrlState } from "./use-url-state";

import styles from "./research-regions.module.css";

// How long a switched chart may keep changing height as its plots measure themselves and its rows render.
const SWITCH_SETTLE_MS = 600;
// The journey track starts and ends this far inside the first and last region links.
const JOURNEY_INSET = 13;

/**
 * The rail pins to the viewport top so the region index and the global controls in `children` stay reachable from any region.
 * Its height is published as `--dashboard-rail-height` on its parent, so region anchors and the leaderboard's pinned header clear it.
 */
export function ResearchRail({ children }: { children: ReactNode }) {
  const railRef = useRef<HTMLElement>(null);
  const indexRef = useRef<HTMLElement>(null);
  const [currentRegion, placeAgain] = useCurrentResearchRegion(indexRef);

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
          {RESEARCH_REGION_IDS.map((id) => (
            <RailLink key={id} id={id} current={id === currentRegion} onChange={placeAgain} />
          ))}
        </nav>
        {children}
      </div>
    </section>
  );
}

// A region's section: a stacked region's is its shown chart, a link to it reading `/duels`, and every other region's is its id.
function useRegionSection(id: ResearchRegionId): DashboardSection {
  const [leaderboard] = useUrlState("leaderboard-chart");
  return id === "leaderboard" ? leaderboard : id;
}

/** The chart a stacked region shows. Choosing one moves the address to it in place, without a history entry, so Back leaves the region as a whole rather than stepping through its charts. */
export function useRegionChart<Id extends StackedRegionId>(id: Id) {
  const charts: readonly { key: RegionChartKey<Id>; label: string }[] = REGION_CHARTS[id];
  const key: `${Id}-chart` = `${id}-chart`;
  const [chosen] = useUrlState(key);
  const choose = (chart: DashboardUrlState[typeof key]) => {
    const patch: DashboardUrlPatch = {};
    patch[key] = chart;
    replaceDashboardUrl(patch);
  };
  return { charts, chosen, choose };
}

/** A region's rail link, to its section's path; a stacked region's names its shown chart. A plain click stays on the page, moving the address and scrolling to the region, while opening the link elsewhere loads it. */
function RailLink({
  id,
  current,
  onChange,
}: {
  id: ResearchRegionId;
  current: boolean;
  onChange: () => void;
}) {
  const section = useRegionSection(id);
  return (
    <a
      href={`/${section}`}
      aria-current={current ? "location" : undefined}
      title={
        isStackedRegion(id) ? REGION_CHARTS[id].map((chart) => chart.label).join(" · ") : undefined
      }
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        showDashboardSection(section);
        regionElement(id)?.scrollIntoView({ block: "start" });
      }}
    >
      {isStackedRegion(id) ? <StackedEntry id={id} onChange={onChange} /> : researchRegionLabel(id)}
    </a>
  );
}

/** A stacked region's rail entry names the chart it shows, then draws one dot per chart with the shown chart's filled. */
function StackedEntry({ id, onChange }: { id: StackedRegionId; onChange: () => void }) {
  const { charts, chosen } = useRegionChart(id);
  // The region's height follows the chosen chart, so the journey is placed again.
  useLayoutEffect(onChange, [chosen, onChange]);
  return (
    <>
      <ChartNames id={id} />
      <span className={styles.stack} aria-hidden="true">
        {charts.map((chart) => (
          <i key={chart.key} data-shown={chart.key === chosen} />
        ))}
      </span>
    </>
  );
}

/** Every chart's name holds one place and only the shown one is visible, so the place keeps its longest name's width and what stands beside it, the rail's other links or the title's chart index, never moves. */
function ChartNames({ id }: { id: StackedRegionId }) {
  const { charts, chosen } = useRegionChart(id);
  return (
    <span className="chart-names">
      {charts.map((chart) => (
        <span key={chart.key} data-shown={chart.key === chosen}>
          {chart.label}
        </span>
      ))}
    </span>
  );
}

/**
 * A stacked region's charts listed beside its title in one fixed order; the shown chart's name glows, and pressing another name shows that chart.
 */
function ChartIndex({ id }: { id: StackedRegionId }) {
  const { charts, chosen, choose } = useRegionChart(id);
  const indexRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pressedIndex !== id) return;
    pressedIndex = null;
    indexRef.current
      ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.focus({ preventScroll: true });
  }, [id, chosen]);
  return (
    <div
      ref={indexRef}
      className="dashboard-section-index"
      role="group"
      aria-label={`${researchRegionLabel(id)} charts`}
      data-capture-exclude
    >
      {charts.map((chart) => (
        <button
          key={chart.key}
          type="button"
          aria-pressed={chart.key === chosen}
          onClick={() => {
            if (chart.key === chosen) return;
            pressedIndex = id;
            holdPage();
            choose(chart.key);
          }}
        >
          {chart.label}
        </button>
      ))}
    </div>
  );
}

// A chart switch replaces the whole region, its index included, so a pressed name leaves its region here for the index that replaces it to take the focus.
let pressedIndex: StackedRegionId | null = null;

let settling: number | undefined;

/**
 * Keeps a region's title where it is through a chart switch, so only what lies beneath it changes; the browser would move it in two ways while the new chart is laid out.
 * Scroll anchoring holds the region below in place and moves this title by the charts' difference in height, so it is off until the chart's late layout passes are done.
 * A chart that mounts short and then grows, as the Timeline does, would shorten the page and pull the scroll position up at the page's end, so the page keeps its height from before the switch for the same time.
 */
function holdPage() {
  const page = document.documentElement;
  page.style.overflowAnchor = "none";
  document.body.style.minHeight = `${page.scrollHeight}px`;
  window.clearTimeout(settling);
  settling = window.setTimeout(() => {
    page.style.removeProperty("overflow-anchor");
    document.body.style.removeProperty("min-height");
  }, SWITCH_SETTLE_MS);
}

/**
 * A region opens with the name the rail gives it, a stacked region with its shown chart's name, then its actions: save an image and copy a link to the region; a stacked region lists its charts beside its title.
 * A figure region's image is its own frame with its plots redrawn at the image's width, named by `capture.title`; a region that renders a separate image supplies its own `capture.action`.
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
  const section = useRegionSection(id);
  return (
    <section
      id={section}
      data-region={id}
      ref={regionRef}
      className={
        className == null ? "dashboard-research-section" : `dashboard-research-section ${className}`
      }
      aria-labelledby={titleId}
    >
      <header className="dashboard-section-head">
        {isStackedRegion(id) ? (
          <div className="dashboard-section-name">
            <h2 id={titleId} className="dashboard-section-title">
              <ChartNames id={id} />
            </h2>
            <ChartIndex id={id} />
          </div>
        ) : (
          <h2 id={titleId} className="dashboard-section-title">
            <span>{researchRegionLabel(id)}</span>
          </h2>
        )}
        <div className="dashboard-section-actions" data-capture-exclude>
          {"action" in capture ? (
            capture.action
          ) : (
            <CaptureButton
              captureWidth={ARTIFACT_WIDTH}
              fileName={capture.fileName}
              targetRef={regionRef}
              title={capture.title}
              onStaged={redrawPlotsForCapture}
            />
          )}
          <CopyDashboardLink section={section} />
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
 * The returned callback places the journey again after a change that moves the links or the regions without a scroll.
 */
function useCurrentResearchRegion(indexRef: RefObject<HTMLElement | null>) {
  const [currentRegion, setCurrentRegion] = useState<ResearchRegionId | null>(null);
  const scheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let updateFrame: number | null = null;
    const updateCurrentRegion = () => {
      updateFrame = null;
      // Found on every frame: a stacked region's element is replaced when its chart changes.
      const regions = RESEARCH_REGION_IDS.flatMap((id) => {
        const element = regionElement(id);
        return element == null ? [] : [{ element, id }];
      });
      if (regions.length === 0) return;
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
          const { section } = readDashboardUrl(new URL(window.location.href));
          if (section != null)
            regionElement(sectionRegion(section))?.scrollIntoView({ block: "start" });
          scheduleUpdate();
        });
      });
    };
    scheduleRef.current = scheduleUpdate;
    alignRegion();
    window.addEventListener("popstate", alignRegion);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      scheduleRef.current = null;
      if (alignmentFrame != null) window.cancelAnimationFrame(alignmentFrame);
      window.removeEventListener("popstate", alignRegion);
      if (updateFrame != null) {
        window.cancelAnimationFrame(updateFrame);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
    };
  }, [indexRef]);

  const placeAgain = useCallback(() => scheduleRef.current?.(), []);
  return [currentRegion, placeAgain] as const;
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
