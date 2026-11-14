/** The sky's light, defined only here for the hero field and every chart sky so a star or a horizon looks the same wherever it is drawn: sprite spans, flare ease, and the chart reference height; the GLSL for the star, flare, grain, horizon colours, and rim pulse; each model's stable seed; and the one clock every sky on the page runs on. */

// A star's sprite spans this many times its size; frontier sprites span more to hold their rays.
export const STAR_SPRITE = 3;
export const FRONTIER_SPRITE = 7;
// Time constant, in seconds, of the explored star's flare.
export const FLARE_EASE = 0.08;
// Chart light lengths are CSS pixels for a full dashboard plot this tall and shrink with smaller plots, such as the phone layout and the model sheet's inset, so the light never outweighs them.
export const REFERENCE_PLOT_HEIGHT = 480;

// Includes `grainHash`, the per-pixel noise behind the rim's stipple.
export const GRAIN_HASH_GLSL = /* glsl */ `
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// The horizon's colours: the deep sky's cobalt near the rim and its night far above, the planet's dark body, and the rim's light, which shifts from cobalt through violet to rose as `t` runs from 0 to 1.
export const HORIZON_LIGHT_GLSL = /* glsl */ `
const vec3 SKY_NEAR = vec3(0.05, 0.09, 0.38);
const vec3 SKY_DEEP = vec3(0.006, 0.01, 0.045);
const vec3 PLANET_BODY = vec3(0.008, 0.01, 0.03);

vec3 horizonLight(float t) {
  vec3 light = mix(vec3(0.42, 0.56, 1.0), vec3(0.64, 0.44, 1.0), smoothstep(0.1, 0.6, t));
  return mix(light, vec3(1.0, 0.56, 0.72), smoothstep(0.55, 1.0, t));
}
`;

// Light runs along every rim on the page together: across in `crossing` seconds, whatever the rim's length, then dark for `gap` seconds, which is what sets how often the light reads; the first pass starts `start` seconds into the sky clock as the hero's stars begin to light, and outlasts the hero's 3.6-second opening by about a second.
const RIM_PULSE = { start: 0.7, crossing: 4, gap: 12 };

// Includes `rimPulse`, how far the pulse has run along a rim: 0 at its start and 1 at its end, and above 1 while it waits past the far end for the next pass, as it does on a clock frozen at zero under reduced motion. Expects a `time` uniform from the sky clock.
export const RIM_PULSE_GLSL = /* glsl */ `
float rimPulse() {
  return mod(time - ${RIM_PULSE.start.toFixed(1)}, ${(RIM_PULSE.crossing + RIM_PULSE.gap).toFixed(1)}) / ${RIM_PULSE.crossing.toFixed(1)};
}
`;

// A star's slow twinkle at two beating rates, so no two stars pulse alike; expects a `time` uniform in seconds.
export const TWINKLE_GLSL = /* glsl */ `
float twinkle(float seed) {
  return 0.86 + 0.09 * sin(time * (1.1 + seed * 2.0) + seed * 50.0) + 0.05 * sin(time * (2.7 + seed * 3.1) + seed * 23.0);
}
`;

// A white-hot core in a corona of the provider's colour; frontier roles add long rays whose tips disperse red beyond blue and along which light runs slowly outward.
// Expects `STAR_SPRITE` and `FRONTIER_SPRITE` defined to the constants above, and the vertex stage to fill every varying below.
export const STAR_FRAGMENT = /* glsl */ `
uniform float time;
varying vec3 vTint;
varying float vSize;
varying float vGlow;
varying float vFlash;
varying float vFrontier;
varying float vRays;
varying float vSeed;

vec3 ray(vec2 q) {
  float along = abs(q.x) / max(vRays, 0.001);
  vec3 taper = pow(clamp(1.0 - along / vec3(1.0, 0.9, 0.8), 0.0, 1.0), vec3(1.6));
  float offset = abs(q.y) * vSize * 0.5;
  return taper * (exp(-offset * (1.5 + 1.5 * along)) + 0.18 * exp(-offset * 0.45));
}

void main() {
  vec2 q = (gl_PointCoord - 0.5) * 2.0;
  // Measure the disc in a plain star's units, so a frontier sprite's extra room goes to its rays.
  float r = length(q) * mix(1.0, FRONTIER_SPRITE / STAR_SPRITE, vFrontier);
  float core = exp(-r * r * 60.0);
  float corona = exp(-r * r * 10.0);
  float halo = exp(-r * 3.4);
  vec3 colour = mix(vTint, vec3(1.0), 0.6) * core * 1.5 + vTint * (corona * 0.45 + halo * 0.12);
  colour += mix(vTint, vec3(1.0), 0.5) * exp(-r * r * 3.0) * vFlash * 0.9;
  float run = 0.85 + 0.15 * sin(length(q) * 16.0 - time * 1.4 + vSeed * 6.283);
  colour += mix(vec3(0.9, 0.94, 1.0), vTint, 0.3) * (ray(q) + ray(q.yx)) * run * vFrontier * 0.75;
  gl_FragColor = vec4(colour * vGlow * smoothstep(1.0, 0.75, length(q)), 1.0);
}
`;

// The explored star flares in its provider's light: a wide halo and long tapered rays, never a ring or sight.
export const FLARE_FRAGMENT = /* glsl */ `
uniform vec3 flareTint;
varying float vGlow;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float radius = length(p) * 2.0;
  float halo = exp(-radius * 4.2) * 0.5;
  float rays = (exp(-abs(p.x) * 150.0) + exp(-abs(p.y) * 150.0)) * pow(max(1.0 - radius, 0.0), 1.6);
  vec3 light = mix(vec3(0.84, 0.88, 1.0), flareTint, 0.35);
  gl_FragColor = vec4(light * (halo + rays * 0.8) * smoothstep(1.0, 0.6, radius) * vGlow, 1.0);
}
`;

// A gap between frames longer than this, such as a hidden tab, advances the sky clock by this much only, so motion resumes where it stopped instead of jumping ahead.
const MAX_CLOCK_STEP_MS = 80;
let clockSeconds = 0;
let clockAt = 0;

/**
 * Seconds on the page's one sky clock, which the hero and every chart sky read so their rims pulse together.
 * `now` is a frame timestamp from `requestAnimationFrame` or `performance.now()`; the first reader at a new timestamp advances the clock, so every sky drawn in one frame reads the same time, and it stands still while no sky reads it.
 */
export function readSkyClock(now: number): number {
  if (now > clockAt) {
    clockSeconds += Math.min(now - clockAt, MAX_CLOCK_STEP_MS) / 1000;
    clockAt = now;
  }
  return clockSeconds;
}

export function restartSkyClock(now: number) {
  clockSeconds = 0;
  clockAt = now;
}

// A sky draws at most this many device pixels per CSS pixel, so dense screens keep its frame cost bounded.
const MAX_PIXEL_RATIO = 1.5;

/** Device pixels per CSS pixel for a sky's renderer; star sprites share it, so they keep their size in device pixels. */
export function skyPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

// Light ink, since a sky is dark wherever it draws.
const SKY_INK = "#eef2ff";

/** A provider chart colour as a star's hex tint; a theme-dependent colour, such as OpenAI's ink, becomes the sky's ink. */
export function skyTint(color: string): string {
  return color.startsWith("#") ? color : SKY_INK;
}

/** Stable unit value for a model key, so a star keeps its place and rhythm across reloads and filter changes. */
export function hashUnit(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
