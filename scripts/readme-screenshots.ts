/** Capture the dashboard's first screen and each research section's screen for the README from the live data under placeholders, so the images show the interface without dating: scores drift by fixed pseudo-random amounts, models are lettered by the drifted rank, the top rows take a fixed mix of labs, labs keep their real colours under lettered marks, and every data value is blurred; the capture fails rather than saving the CSS fallback when headless Chromium cannot draw the WebGL sky. */

import { chromium } from "playwright";

import type { TimelinePoint } from "../app/dashboard/graphs/timeline/chart-data";
import { providerDisplayName, providerLogo } from "../app/dashboard/shared/provider-theme";
import { providerIdentityKey } from "../src/model-atlas/identity/provider";
import type { ModelAtlasPayload } from "../src/model-atlas/stats/types";

// TypeScript's DOM library omits the map methods the CSS Custom Highlight API gives this registry.
declare global {
  interface HighlightRegistry extends Map<string, Highlight> {}
}

const SITE = "https://llmstats.vercel.app";
const ASSETS = ".github/assets";
const SCREEN = { width: 1440, height: 900 };
// The planet's grain makes a lossless capture several times larger with no visible gain.
const JPEG = { type: "jpeg", quality: 92 } as const;
// Enough to reorder models with close scores without changing the data's overall shape.
const SCORE_DRIFT = 4;
const INDEX_DRIFT = 0.03;
// The leaderboard's eight visible rows take these labs in rank order, whoever leads the live data, so the table always shows a realistic mix and no lab is crowned by a release's timing.
const TOP_ROW_LABS = [
  "anthropic",
  "openai",
  "google",
  "moonshotai",
  "openai",
  "openai",
  "anthropic",
  "deepseek",
];

const [live, liveTimeline]: [ModelAtlasPayload, TimelinePoint[]] = await Promise.all([
  readJson(`${SITE}/api/llm-stats?view=dashboard`),
  readJson(`${SITE}/api/timeline?view=chart`),
]);
const drifted = live.models.map(driftScores);
const leaders = [
  ...new Set(
    [...drifted]
      .sort((a, b) => b.scores.intelligence_score - a.scores.intelligence_score)
      .map(({ name }) => name),
  ),
];
const topRowLabs = new Map(
  TOP_ROW_LABS.flatMap((lab, index) => {
    const name = leaders[index];
    return name == null ? [] : [[name, lab] as const];
  }),
);
const dashboard = {
  ...live,
  models: drifted.map((model) => {
    const provider = model.name == null ? undefined : topRowLabs.get(model.name);
    return provider == null
      ? model
      : { ...model, provider, logo: `${SITE}${providerLogo(provider)}` };
  }),
};
const timeline = liveTimeline.map((point) => ({
  ...point,
  provider: topRowLabs.get(point.name) ?? point.provider,
  score: point.score * (1 + drift(`${point.name}:index`, INDEX_DRIFT)),
}));
const { strings, labLabels, labIcons } = placeholders(dashboard, timeline);
const anonymize = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "string" ? (strings.get(item) ?? item) : item,
  );
const dashboardBody = anonymize(dashboard);
const timelineBody = anonymize(timeline);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: SCREEN,
    deviceScaleFactor: 2,
    colorScheme: "dark",
    // Reduced motion draws the sky's settled frame at once instead of playing its opening.
    reducedMotion: "reduce",
  });
  await page.route(
    (url) => url.pathname === "/api/llm-stats" && url.searchParams.get("view") === "dashboard",
    (route) => route.fulfill({ contentType: "application/json", body: dashboardBody }),
  );
  await page.route(
    (url) => url.pathname === "/api/timeline" && url.searchParams.get("view") === "chart",
    (route) => route.fulfill({ contentType: "application/json", body: timelineBody }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/provider-icons/"),
    (route) => {
      const mark = labIcons.get(new URL(route.request().url()).pathname);
      // An icon no placeholder lab claims would show a real logo, so its slot stays empty instead.
      return mark == null
        ? route.abort()
        : route.fulfill({ contentType: "image/svg+xml", body: labIcon(mark) });
    },
  );
  const open = async (url: string) => {
    await page.goto(url);
    await page.waitForSelector('[data-sky="webgl"]', { timeout: 30_000 });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".dashboard-main")!).opacity === "1",
    );
    // Masked values blur past reading while keeping their shape; a number input's value is not text the highlight can reach.
    await page.addStyleTag({
      content: `::highlight(readme-mask), .dashboard-main input[type="number"] { color: transparent; text-shadow: 0 0 0.75em rgb(231 233 241 / 0.95); }`,
    });
  };
  const align = (id: string) =>
    page.evaluate((id) => {
      const section = document.getElementById(id)!;
      section.scrollIntoView({ block: "start" });
      return section.getBoundingClientRect().bottom;
    }, id);
  const capture = async (path: string) => {
    // A resize re-renders text, which would escape a mask set earlier, so masking waits for the frame to settle.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.evaluate(mask, Object.fromEntries(labLabels));
    await page.screenshot({ path, ...JPEG });
  };

  await open(SITE);
  await capture(`${ASSETS}/hero.jpg`);

  // The leaderboard is shown in its Scores view, and the graphs plot every reasoning-effort variant.
  await open(`${SITE}/?view=scores&graph-variants=1`);
  // The hero's star labels fade out as a normal visit scrolls on, but reduced motion keeps them over every section.
  await page.addStyleTag({ content: "[data-sky] > span { visibility: hidden !important; }" });
  for (const [id, file] of [
    ["leaderboard", "leaderboard"],
    ["pareto-analysis", "pareto"],
    ["timeline", "timeline"],
  ] as const) {
    await page.setViewportSize(SCREEN);
    await page.waitForFunction(
      (id) => !document.querySelector(`#${id} [role="status"]:not([data-capture-exclude] *)`),
      id,
    );
    // Sections taller than the screen get a taller window, so each shot holds the whole panel with a band of sky beneath it.
    const bottom = await align(id);
    await page.setViewportSize({
      ...SCREEN,
      height: Math.max(SCREEN.height, Math.ceil(bottom) + 40),
    });
    await align(id);
    await page
      .locator(`[aria-label="Dashboard sections"] a[href="#${id}"][aria-current="location"]`)
      .waitFor();
    await capture(`${ASSETS}/${file}.jpg`);
  }
} finally {
  await browser.close();
}

async function readJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/** A model's effort variants share each offset, so they move together. */
function driftScores(model: ModelAtlasPayload["models"][number]) {
  const shift = (score: number, kind: string) =>
    Math.min(100, Math.max(0, score + drift(`${model.name}:${kind}`, SCORE_DRIFT)));
  const { intelligence_score, agentic_score, speed_score, value_score } = model.scores;
  return {
    ...model,
    scores: {
      intelligence_score: shift(intelligence_score, "intelligence"),
      agentic_score: shift(agentic_score, "agentic"),
      speed_score: speed_score == null ? null : shift(speed_score, "speed"),
      value_score: value_score == null ? null : shift(value_score, "value"),
    },
  };
}

/** A fixed offset in [−spread, spread] hashed from the key, so every run draws the same images. */
function drift(key: string, spread: number) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) / 2 ** 32) * 2 * spread - spread;
}

/** Letter models by Intelligence rank, so the top rows read Model A, B, and C, and letter labs the same way; labs keep their real identities, so only their marks and labels change. */
function placeholders(dashboard: ModelAtlasPayload, timeline: TimelinePoint[]) {
  const ranked = [
    ...dashboard.models
      .map(({ id, name, provider, logo, scores }) => ({
        id,
        name,
        provider,
        logo,
        score: scores.intelligence_score,
      }))
      .sort((a, b) => b.score - a.score),
    ...timeline
      .map(({ name, provider, score }) => ({ id: null, name, provider, logo: null, score }))
      .sort((a, b) => b.score - a.score),
  ];
  const strings = new Map<string, string>();
  const labLabels = new Map<string, string>();
  const labIcons = new Map<string, string>();
  const labs: string[] = [];
  let models = 0;
  for (const { id, name, provider, logo } of ranked) {
    if (name != null && !strings.has(name)) strings.set(name, `Model ${letters(models++)}`);
    const model = name == null ? null : strings.get(name);
    if (id != null && model != null) strings.set(id, model.toLowerCase().replace(" ", "-"));
    const lab = providerIdentityKey(provider);
    if (!labs.includes(lab)) labs.push(lab);
    const mark = letters(labs.indexOf(lab));
    labLabels.set(providerDisplayName(provider), `Lab ${mark}`);
    const bundled = providerLogo(provider);
    if (bundled) labIcons.set(bundled, mark);
    if (logo) labIcons.set(new URL(logo).pathname, mark);
  }
  return { strings, labLabels, labIcons };
}

/** A zero-based index as spreadsheet column letters. */
function letters(index: number): string {
  return (
    (index >= 26 ? letters(Math.floor(index / 26) - 1) : "") +
    String.fromCharCode(65 + (index % 26))
  );
}

function labIcon(mark: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#262b38"/><text x="16" y="21.5" fill="#e7e9f1" font-family="Helvetica, Arial, sans-serif" font-size="${mark.length > 1 ? 12 : 16}" font-weight="700" text-anchor="middle">${mark}</text></svg>`;
}

/**
 * Runs in the page: blur every data value and rename lab labels.
 * Section ordinals, table ranks, and thresholds after ≥ or ≤ are layout or policy rather than data, and chart text in SVG keeps its axes readable.
 */
function mask(labLabels: Record<string, string>) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const values: Range[] = [];
  for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
    if (
      node.parentElement?.closest(
        'svg, td.rank, .dashboard-section-title b, [aria-label="Dashboard sections"] b',
      ) != null ||
      /[≥≤]\s*$/.test(node.previousSibling?.textContent ?? "")
    ) {
      continue;
    }
    const text = node.textContent?.trim() ?? "";
    const label = labLabels[text];
    if (label != null) {
      node.textContent = label;
    } else if (/\d/.test(text) && !/\p{L}{2}/u.test(text)) {
      const range = document.createRange();
      range.selectNodeContents(node);
      values.push(range);
    }
  }
  CSS.highlights.set("readme-mask", new Highlight(...values));
}
