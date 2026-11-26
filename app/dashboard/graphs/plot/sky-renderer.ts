/**
 * Draws a chart's plot as the hero's sky in raw WebGL: open sky above the frontier's rim, the rim lit with its stipple band and pulse, the planet's dark body below it, and every model as a hero star.
 * Geometry arrives in the chart's SVG coordinates: CSS pixels, y down.
 * It also renders a plotted star alone as a still image, the one star every HTML mark for a model outside the plots shows.
 */

import {
  FLARE_EASE,
  FLARE_FRAGMENT,
  FRONTIER_SPRITE,
  GRAIN_GLSL,
  hashUnit,
  HORIZON_LIGHT_GLSL,
  REFERENCE_PLOT_HEIGHT,
  RIM_PULSE_GLSL,
  skyPixelRatio,
  skyTint,
  STAR_FRAGMENT,
  STAR_SPRITE,
  TWINKLE_GLSL,
} from "../../shared/sky-light";
import type { HorizonTrail, PlotBounds } from "./Primitives";

export type SkyStarRole = "star" | "frontier" | "leader";

export type SkyPlotStar = {
  key: string;
  x: number;
  y: number;
  /** Provider chart colour; a theme-dependent colour takes the sky's ink. */
  color: string;
  /** Frontier stars carry rays; the leader is the frontier's brightest. */
  role: SkyStarRole;
  /** Brightness the chart sets from 0 to 1, such as evidence support or a muted variant. */
  glow: number;
  /** Size multiplier, such as a replay's arrival swell. */
  scale?: number;
};

/** How far from a plotted star's centre its visible body reaches, where a line drawn over the stars stops so it meets the star without crossing it. */
export function starBody(
  { role, glow, scale = 1 }: Pick<SkyPlotStar, "role" | "glow" | "scale">,
  flaring: boolean,
): number {
  const size =
    role === "leader" ? LEADER_SIZE : role === "frontier" ? FRONTIER_SIZE : STAR_SIZE.high;
  const light = 0.6 + 0.4 * Math.min(1, glow);
  return size * STAR_SPRITE * BODY_REACH * light * scale * (flaring ? FLARE_BODY : 1);
}

export type SkyPlotScene = {
  width: number;
  height: number;
  bounds: PlotBounds;
  /** Paints `bounds` as sky, with the horizon where a rim is given, and lets plain stars grow and brighten with height in it; without it the stars alone light the bare panel, all alike, for a chart whose rows are a table's rather than heights. */
  sky: boolean;
  /** The frontier's rim in ascending x, already extended to the plot edge on its open side; with fewer than two points no planet is drawn. */
  rim: readonly { x: number; y: number }[];
  /** The rim's guessed continuation past the frontier's closed end, along which the planet continues and the rim's light fades out. */
  trail: HorizonTrail | null;
  /** Dims the rim while another selection owns the chart's emphasis. */
  muted: boolean;
  stars: readonly SkyPlotStar[];
  /** Key of the star being explored, which flares. */
  flare: string | null;
  /** Stars a chart's find field located, each with the `performance.now()` it was located at, from which it flares out once and fades. */
  found: readonly { key: string; at: number }[];
  /** Phone plots draw stars and flares smaller. */
  compact: boolean;
};

export type SkyRenderer = ReturnType<typeof createSkyRenderer>;

/** A star's share of light while another model holds the chart's focus, matching the opacity its SVG mark keeps. */
export const MUTED_STAR_GLOW = 0.34;

// The open sky's opacity over the panel's charcoal: enough of the hero's cobalt to read as its sky, little enough that the plot still sits on a charcoal panel.
const SKY_STRENGTH = 0.42;
// A muted rim keeps this share of its light.
const MUTED_RIM = 0.4;
// The shader's room for rim points, about three times today's longest frontier; a longer rim is cut at its far end.
const MAX_RIM = 64;
// Sizes in CSS pixels on the hero's scale, where a sprite spans STAR_SPRITE times its size and a frontier sprite FRONTIER_SPRITE times.
// The lowest stars stay large enough to find and point at, not only to see.
const STAR_SIZE = { low: 9.2, high: 10.6 };
const FRONTIER_SIZE = 9.2;
const LEADER_SIZE = 11.6;
const COMPACT_SIZE = 0.8;
// Plain stars brighten with height; frontier stars and the leader outshine the rim they sit on.
const STAR_GLOW = { low: 0.9, high: 1, frontier: 1.05, leader: 1.3 };
// A crowded plot's plain stars would blur into a haze at full light, so they dim with the square root of how much closer they sit than one per `spacing` square CSS pixels, down to `floor`; a desktop Pareto plot keeps full light, and frontier stars always do.
const CROWD = { spacing: 3000, floor: 0.5 };
// A chart is read among text and other panels, so its rim and stars keep only this share of their colours' saturation, calmer than the hero's sky.
const SATURATION = 0.75;
// A chart's frontier rays end at this share of their sprite, shorter than the hero's, so a frontier star reads as one without its rays crossing its neighbours and their names.
const RAY_REACH = 0.55;
// An explored star's flare, whatever the star's role, spans as far as a frontier star's own rays, so pointing at a star never reaches further across its neighbours and their names than the frontier already does.
const FLARE_SPAN = FRONTIER_SIZE * FRONTIER_SPRITE * RAY_REACH;
// A star's visible body, its core and the bright inside of its corona, reaches about this share of its sprite from its centre at full light, where the shader's falloff fades it into the halo; a dimmed star's body is smaller, and a flaring one reads this much wider.
const BODY_REACH = 0.125;
const FLARE_BODY = 1.25;
// A located star's flare opens at `1 + reach` times an explored flare's size and `1 + light` times its light, fading out over `ms`: long enough to catch the eye in a dense field, short enough to be over before the reader starts reading.
const FOUND_FLARE = { reach: 2.4, light: 0.6, ms: 900 };
// Distance along x, in CSS pixels at the reference plot height, over which a trail's light falls to about a third.
const TRAIL_FADE = 40;

const DEFINES = `
precision highp float;
#define SKY_STRENGTH ${SKY_STRENGTH.toFixed(2)}
#define SATURATION ${SATURATION.toFixed(2)}
#define MAX_RIM ${MAX_RIM}
#define STAR_SPRITE ${STAR_SPRITE.toFixed(1)}
#define FRONTIER_SPRITE ${FRONTIER_SPRITE.toFixed(1)}
`;

const QUAD_VERTEX = /* glsl */ `
attribute vec2 corner;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
}
`;

// The hero's horizon with its circular rim replaced by the frontier polyline; lengths are CSS pixels scaled by `reach`.
const HORIZON_FRAGMENT = /* glsl */ `
uniform vec2 resolution;
uniform float pixelRatio;
uniform float time;
uniform vec4 plot;
uniform vec2 rim[MAX_RIM];
uniform float rimArc[MAX_RIM];
uniform int rimCount;
uniform float rimLength;
// 1 where the rim's first or last point stops inside the plot, such as at a replay's reveal, so the body ends softly there and the light fades out behind it.
uniform vec2 rimCut;
// The frontier's closed end along x and the direction its trail runs from there, which is zero where the rim has no trail.
uniform vec2 trail;
uniform float reach;
uniform float rimStrength;
${GRAIN_GLSL}
${HORIZON_LIGHT_GLSL}
${RIM_PULSE_GLSL}

// Share of this device pixel, along one axis, that a span given in CSS pixels covers, so the plot's edges land as crisply as SVG.
float cover(float from, float to, float at) {
  return clamp(min(at + 0.5, to * pixelRatio) - max(at - 0.5, from * pixelRatio), 0.0, 1.0);
}

void main() {
  vec2 device = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
  float inPlot = cover(plot.x, plot.z, device.x) * cover(plot.y, plot.w, device.y);
  if (inPlot <= 0.0 || rimCount < 2) {
    gl_FragColor = vec4(SKY_DEEP, 1.0) * SKY_STRENGTH * inPlot;
    return;
  }
  vec2 p = device / pixelRatio;
  vec2 first = rim[0];
  vec2 second = rim[1];
  vec2 last = first;
  vec2 beforeLast = first;
  float toRim = 1e6;
  float along = 0.0;
  float nearestX = first.x;
  float rimY = first.y;
  for (int i = 0; i < MAX_RIM - 1; i++) {
    if (i >= rimCount - 1) break;
    vec2 a = rim[i];
    vec2 b = rim[i + 1];
    vec2 ab = b - a;
    float len = max(length(ab), 1e-3);
    float t = clamp(dot(p - a, ab) / (len * len), 0.0, 1.0);
    vec2 q = a + ab * t;
    float d = length(p - q);
    if (d < toRim) {
      toRim = d;
      along = rimArc[i] + t * len;
      nearestX = q.x;
    }
    if (p.x >= a.x && p.x <= b.x) rimY = mix(a.y, b.y, (p.x - a.x) / max(b.x - a.x, 1e-3));
    if (p.x > b.x) rimY = b.y;
    beforeLast = a;
    last = b;
  }
  // The reached region lies below the rim between its ends; an end inside the plot softens into the sky instead of standing as a cut edge.
  float side = p.y > rimY ? -1.0 : 1.0;
  float body = clamp(0.5 - side * toRim * pixelRatio, 0.0, 1.0);
  body *= mix(step(first.x, p.x), smoothstep(first.x - 1.0, first.x + 18.0 * reach, p.x), rimCut.x);
  body *= mix(step(p.x, last.x), smoothstep(last.x + 1.0, last.x - 18.0 * reach, p.x), rimCut.y);
  // Past the closed end the rim only guesses the frontier's trend: the planet carries on sideways instead of ending in a wall, and only the rim's light fades.
  float past = max((nearestX - trail.x) * trail.y, 0.0);
  float guessed = exp(-past * past / (${(TRAIL_FADE * TRAIL_FADE).toFixed(1)} * reach * reach));
  vec3 light = horizonLight(clamp((nearestX - plot.x) / (plot.z - plot.x), 0.0, 1.0));
  light = mix(vec3(dot(light, vec3(0.2126, 0.7152, 0.0722))), light, SATURATION);
  float behind = max(
    rimCut.x * max(-dot(p - first, normalize(second - first)), 0.0),
    rimCut.y * max(dot(p - last, normalize(last - beforeLast)), 0.0)
  );
  float begun = exp(-behind * behind / (1600.0 * reach * reach)) * guessed;
  float pulseOffset = (along / rimLength + 0.05 - rimPulse() * 1.1) * rimLength / (40.0 * reach);
  float limbLight = 1.0 + exp(-toRim / (14.0 * reach)) * exp(-pulseOffset * pulseOffset) * 1.1;
  float lit = begun * limbLight * rimStrength;
  // Past a cut end the sky counts as far from the rim, so an empty corner stays deep.
  float skyDistance = toRim + behind * behind / (18.0 * reach);
  // The open sky is translucent, so the panel's charcoal shows through it; light only adds, and the planet's body is opaque.
  vec3 sky = mix(SKY_NEAR, SKY_DEEP, smoothstep(0.0, 440.0 * reach, skyDistance)) * SKY_STRENGTH;
  sky += light * exp(-toRim / (95.0 * reach)) * 0.34 * lit;
  float band = exp(-toRim / (32.0 * reach));
  float stipple = step(grainHash(gl_FragCoord.xy), band * 0.85);
  vec3 mound = PLANET_BODY + light * (0.11 * band + 0.44 * stipple * band) * lit;
  vec3 colour = mix(sky, mound, body);
  colour += light * exp(-toRim / (5.0 * reach)) * 0.6 * lit;
  colour += mix(light, vec3(1.0), 0.35) * (1.0 - smoothstep(0.25, 1.1, toRim)) * 0.45 * lit;
  gl_FragColor = vec4(colour + dither(gl_FragCoord.xy), mix(SKY_STRENGTH, 1.0, body)) * inPlot;
}
`;

const STAR_VERTEX = /* glsl */ `
uniform vec2 viewport;
uniform float pixelRatio;
uniform float time;
attribute vec2 point;
attribute vec3 tint;
attribute float size;
attribute float seed;
attribute float frontier;
attribute float glow;
varying vec3 vTint;
varying float vSize;
varying float vGlow;
varying float vFlash;
varying float vFrontier;
varying float vRays;
varying float vSeed;
${TWINKLE_GLSL}
void main() {
  gl_Position = vec4(point.x / viewport.x * 2.0 - 1.0, 1.0 - point.y / viewport.y * 2.0, 0.0, 1.0);
  gl_PointSize = size * pixelRatio * mix(STAR_SPRITE, FRONTIER_SPRITE, frontier);
  vTint = tint;
  vSize = gl_PointSize;
  vGlow = glow * twinkle(seed);
  vFlash = 0.0;
  vFrontier = frontier;
  vRays = ${RAY_REACH.toFixed(2)};
  vSeed = seed;
}
`;

const FLARE_VERTEX = /* glsl */ `
uniform vec2 viewport;
uniform float pixelRatio;
uniform vec2 focus;
uniform float flareSize;
uniform float flare;
varying float vGlow;
void main() {
  gl_Position = vec4(focus.x / viewport.x * 2.0 - 1.0, 1.0 - focus.y / viewport.y * 2.0, 0.0, 1.0);
  gl_PointSize = flareSize * pixelRatio;
  vGlow = flare;
}
`;

const STAR_ATTRIBUTES = [
  ["point", 2],
  ["tint", 3],
  ["size", 1],
  ["seed", 1],
  ["frontier", 1],
  ["glow", 1],
] as const;
const STAR_STRIDE = STAR_ATTRIBUTES.reduce((sum, [, count]) => sum + count, 0);

/**
 * Compile the sky for `canvas`, or return null where WebGL cannot run.
 * `setScene` sizes the canvas and uploads the chart; `draw` renders one frame, easing the flare over `elapsed` seconds (Infinity snaps it), and reports whether the flare is still settling.
 */
export function createSkyRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  });
  if (gl == null) return null;
  const horizon = program(gl, QUAD_VERTEX, HORIZON_FRAGMENT);
  const stars = program(gl, STAR_VERTEX, STAR_FRAGMENT);
  const flares = program(gl, FLARE_VERTEX, FLARE_FRAGMENT);
  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const starBuffer = gl.createBuffer();

  let scene: SkyPlotScene | null = null;
  let pixelRatio = 1;
  let starCount = 0;
  const rim = {
    points: new Float32Array(MAX_RIM * 2),
    arc: new Float32Array(MAX_RIM),
    count: 0,
    length: 1,
    trail: { x: 0, direction: 0 },
  };
  const flare = { value: 0, target: null as SkyPlotStar | null, shown: null as SkyPlotStar | null };
  let found: { star: SkyPlotStar; at: number }[] = [];

  return {
    setScene(next: SkyPlotScene, nextPixelRatio: number) {
      scene = next;
      pixelRatio = nextPixelRatio;
      const width = Math.max(1, Math.round(next.width * pixelRatio));
      const height = Math.max(1, Math.round(next.height * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const { trail } = next;
      const line =
        trail == null
          ? next.rim
          : trail.to.x < trail.from.x
            ? [trail.to, ...next.rim]
            : [...next.rim, trail.to];
      rim.trail =
        trail == null
          ? { x: 0, direction: 0 }
          : { x: trail.from.x, direction: Math.sign(trail.to.x - trail.from.x) };
      const points = line.slice(0, MAX_RIM);
      rim.count = points.length;
      rim.length = 0;
      points.forEach((point, index) => {
        const previous = points[index - 1];
        if (previous != null) rim.length += Math.hypot(point.x - previous.x, point.y - previous.y);
        rim.points.set([point.x, point.y], index * 2);
        rim.arc[index] = rim.length;
      });
      rim.length = Math.max(rim.length, 1);
      const { bounds, compact } = next;
      const sizeScale = compact ? COMPACT_SIZE : 1;
      const crowd = starCrowd(next);
      const data = new Float32Array(next.stars.length * STAR_STRIDE);
      // Frontier stars draw last so their rays lie over their neighbours.
      [...next.stars]
        .sort((left, right) => Number(left.role !== "star") - Number(right.role !== "star"))
        .forEach((star, index) => {
          const altitude = next.sky
            ? Math.min(1, Math.max(0, (bounds.bottom - star.y) / (bounds.bottom - bounds.top)))
            : 1;
          const size =
            star.role === "leader"
              ? LEADER_SIZE
              : star.role === "frontier"
                ? FRONTIER_SIZE
                : STAR_SIZE.low + (STAR_SIZE.high - STAR_SIZE.low) * altitude ** 1.5;
          const glow =
            star.role === "leader"
              ? STAR_GLOW.leader
              : star.role === "frontier"
                ? STAR_GLOW.frontier
                : (STAR_GLOW.low + (STAR_GLOW.high - STAR_GLOW.low) * altitude) * crowd;
          data.set(
            [
              star.x,
              star.y,
              ...starTint(star.color),
              size * sizeScale * (star.scale ?? 1),
              hashUnit(star.key),
              star.role === "star" ? 0 : 1,
              glow * star.glow,
            ],
            index * STAR_STRIDE,
          );
        });
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      starCount = next.stars.length;
      flare.target =
        next.flare == null ? null : (next.stars.find((star) => star.key === next.flare) ?? null);
      if (flare.target != null) flare.shown = flare.target;
      found = next.found.flatMap(({ key, at }) => {
        const star = next.stars.find((candidate) => candidate.key === key);
        return star == null ? [] : [{ star, at }];
      });
    },
    draw(time: number, elapsed: number): boolean {
      if (scene == null) return false;
      const { width, height, bounds, compact, muted } = scene;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (scene.sky) {
        gl.disable(gl.BLEND);
        gl.useProgram(horizon.program);
        const h = horizon.uniform;
        gl.uniform2f(h("resolution"), canvas.width, canvas.height);
        gl.uniform1f(h("pixelRatio"), pixelRatio);
        gl.uniform1f(h("time"), time);
        gl.uniform4f(h("plot"), bounds.left, bounds.top, bounds.right, bounds.bottom);
        gl.uniform2fv(h("rim"), rim.points);
        gl.uniform1fv(h("rimArc"), rim.arc);
        gl.uniform1i(h("rimCount"), rim.count);
        gl.uniform1f(h("rimLength"), rim.length);
        gl.uniform2f(
          h("rimCut"),
          rim.count > 0 && rim.points[0]! > bounds.left + 0.5 ? 1 : 0,
          rim.count > 0 && rim.points[(rim.count - 1) * 2]! < bounds.right - 0.5 ? 1 : 0,
        );
        gl.uniform2f(h("trail"), rim.trail.x, rim.trail.direction);
        gl.uniform1f(h("reach"), Math.min(1, (bounds.bottom - bounds.top) / REFERENCE_PLOT_HEIGHT));
        gl.uniform1f(h("rimStrength"), muted ? MUTED_RIM : 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
        const corner = horizon.attribute("corner");
        gl.enableVertexAttribArray(corner);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(corner);
      }

      // Light adds: onto the opaque sky inside the plot, and past its edge onto the panel, keeping the sky's alpha.
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.useProgram(stars.program);
      const s = stars.uniform;
      gl.uniform2f(s("viewport"), width, height);
      gl.uniform1f(s("pixelRatio"), pixelRatio);
      gl.uniform1f(s("time"), time);
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
      const enabled = enableStarAttributes(gl, stars);
      gl.drawArrays(gl.POINTS, 0, starCount);
      for (const location of enabled) gl.disableVertexAttribArray(location);

      gl.useProgram(flares.program);
      const f = flares.uniform;
      gl.uniform2f(f("viewport"), width, height);
      gl.uniform1f(f("pixelRatio"), pixelRatio);
      const drawFlare = (star: SkyPlotStar, swell: number, light: number) => {
        gl.uniform2f(f("focus"), star.x, star.y);
        gl.uniform1f(f("flareSize"), FLARE_SPAN * (compact ? COMPACT_SIZE : 1) * swell);
        gl.uniform3f(f("flareTint"), ...starTint(star.color));
        gl.uniform1f(f("flare"), light);
        gl.drawArrays(gl.POINTS, 0, 1);
      };
      // The flare eases toward its star and fades out where that star last stood.
      flare.value +=
        ((flare.target == null ? 0 : 1) - flare.value) * (1 - Math.exp(-elapsed / FLARE_EASE));
      if (flare.shown != null && flare.value > 0.002) drawFlare(flare.shown, 1, flare.value);
      // A snapped frame, as under reduced motion, skips the located stars' flares.
      const now = performance.now();
      let bursting = false;
      for (const { star, at } of elapsed === Infinity ? [] : found) {
        const burst = Math.max(0, 1 - (now - at) / FOUND_FLARE.ms) ** 2;
        if (burst <= 0) continue;
        bursting = true;
        drawFlare(star, 1 + FOUND_FLARE.reach * burst, (1 + FOUND_FLARE.light) * burst);
      }
      return Math.abs((flare.target == null ? 0 : 1) - flare.value) > 0.002 || bursting;
    },
    dispose() {
      gl.deleteBuffer(triangle);
      gl.deleteBuffer(starBuffer);
      for (const { program: linked } of [horizon, stars, flares]) gl.deleteProgram(linked);
    },
  };
}

// A role's star drawn alone as a still image, at the light it has in a plot: a plain star as the plot's highest, frontier stars and the leader as plotted.
const STILL_STAR: Record<SkyStarRole, { size: number; glow: number }> = {
  star: { size: STAR_SIZE.high, glow: STAR_GLOW.high },
  frontier: { size: FRONTIER_SIZE, glow: STAR_GLOW.frontier },
  leader: { size: LEADER_SIZE, glow: STAR_GLOW.leader },
};
const stillImages = new Map<string, string | null>();
let still:
  | { gl: WebGLRenderingContext; stars: ReturnType<typeof program>; buffer: WebGLBuffer }
  | null
  | undefined;

/** CSS pixels a still star image spans, its rays included. */
export function stillStarSpan(role: SkyStarRole): number {
  return STILL_STAR[role].size * (role === "star" ? STAR_SPRITE : FRONTIER_SPRITE);
}

/**
 * A plotted star as a still image, for an HTML mark that stands for a model outside the plots, so the mark is the plots' own star: their shader, tint, size, and light.
 * The sky adds a star's light to what lies beneath, while the image carries that light as colour over transparency, which looks the same on the dark surfaces these marks sit on.
 * Images are cached by role and colour; null where WebGL cannot run.
 */
export function stillStarImage(color: string, role: SkyStarRole): string | null {
  const key = `${role} ${color}`;
  const cached = stillImages.get(key);
  if (cached !== undefined) return cached;
  if (still === undefined) {
    const gl = document
      .createElement("canvas")
      .getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true });
    still =
      gl == null
        ? null
        : { gl, stars: program(gl, STAR_VERTEX, STAR_FRAGMENT), buffer: gl.createBuffer()! };
  }
  if (still == null) {
    stillImages.set(key, null);
    return null;
  }
  const { gl, stars, buffer } = still;
  const span = stillStarSpan(role);
  const pixelRatio = skyPixelRatio();
  const pixels = Math.ceil(span * pixelRatio);
  gl.canvas.width = pixels;
  gl.canvas.height = pixels;
  gl.viewport(0, 0, pixels, pixels);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(stars.program);
  gl.uniform2f(stars.uniform("viewport"), span, span);
  gl.uniform1f(stars.uniform("pixelRatio"), pixelRatio);
  gl.uniform1f(stars.uniform("time"), 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const { size, glow } = STILL_STAR[role];
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      span / 2,
      span / 2,
      ...starTint(color),
      size,
      0,
      role === "star" ? 0 : 1,
      glow,
    ]),
    gl.STATIC_DRAW,
  );
  const enabled = enableStarAttributes(gl, stars);
  gl.drawArrays(gl.POINTS, 0, 1);
  for (const location of enabled) gl.disableVertexAttribArray(location);
  const light = new Uint8Array(pixels * pixels * 4);
  gl.readPixels(0, 0, pixels, pixels, gl.RGBA, gl.UNSIGNED_BYTE, light);
  // Light added to black becomes colour over transparency: the brightest channel is the pixel's opacity and the colour is the light divided by it, so light (64, 32, 0) → colour (255, 128, 0) at opacity 64. WebGL reads rows bottom up, so they are flipped.
  const sheet = document.createElement("canvas");
  sheet.width = pixels;
  sheet.height = pixels;
  const context = sheet.getContext("2d")!;
  const image = context.createImageData(pixels, pixels);
  for (let row = 0; row < pixels; row++) {
    for (let column = 0; column < pixels; column++) {
      const from = ((pixels - 1 - row) * pixels + column) * 4;
      const to = (row * pixels + column) * 4;
      const alpha = Math.max(light[from]!, light[from + 1]!, light[from + 2]!);
      for (let channel = 0; channel < 3; channel++) {
        image.data[to + channel] =
          alpha === 0 ? 0 : Math.round((light[from + channel]! * 255) / alpha);
      }
      image.data[to + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);
  const url = sheet.toDataURL();
  stillImages.set(key, url);
  return url;
}

/** Point the star program's attributes at the bound buffer's interleaved stars, returning the locations to disable after drawing. */
function enableStarAttributes(
  gl: WebGLRenderingContext,
  linked: ReturnType<typeof program>,
): number[] {
  const enabled: number[] = [];
  let offset = 0;
  for (const [name, count] of STAR_ATTRIBUTES) {
    const location = linked.attribute(name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, STAR_STRIDE * 4, offset * 4);
    enabled.push(location);
    offset += count;
  }
  return enabled;
}

/** The share of light a scene's plain stars keep for how crowded its plot is. */
function starCrowd({ bounds, stars }: Pick<SkyPlotScene, "bounds" | "stars">): number {
  const plain = stars.filter((star) => star.role === "star").length;
  const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  return Math.max(CROWD.floor, Math.min(1, Math.sqrt(area / (Math.max(plain, 1) * CROWD.spacing))));
}

function program(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, DEFINES + source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Sky shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const linked = gl.createProgram()!;
  gl.attachShader(linked, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(linked, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    throw new Error(`Sky shader failed to link: ${gl.getProgramInfoLog(linked)}`);
  }
  const locations = new Map<string, WebGLUniformLocation | null>();
  // A uniform the compiler dropped has no location, and setting it is a no-op.
  const uniform = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(linked, name));
    return locations.get(name) ?? null;
  };
  const attributes = new Map<string, number>();
  const attribute = (name: string) => {
    if (!attributes.has(name)) attributes.set(name, gl.getAttribLocation(linked, name));
    return attributes.get(name)!;
  };
  return { program: linked, uniform, attribute };
}

// The hero's three.js colours treat a hex tint as sRGB and light in linear values, so the chart converts the same way to match its stars, then eases them to the chart's saturation.
// Before that easing, `#ff8000` → [1.000, 0.216, 0.000].
function starTint(color: string): [number, number, number] {
  const value = Number.parseInt(skyTint(color).slice(1), 16);
  const linear = (channel: number) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = [linear(value >> 16), linear((value >> 8) & 255), linear(value & 255)];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const ease = (channel: number) => luminance + (channel - luminance) * SATURATION;
  return [ease(red), ease(green), ease(blue)];
}
