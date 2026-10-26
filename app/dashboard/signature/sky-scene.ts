/** The frontier sky: models rise as stars over a glowing horizon, and scrolling scopes the camera past the horizon into the star field. */

import * as THREE from "three";

import { clamp01, smoothstep } from "../../../src/model-atlas/math-utils";

// The research content behaves as the z = 0 plane; the hero camera sits this far in front of it.
export const CAMERA_DISTANCE = 12;
export const FIELD_OF_VIEW = 30;
const TAN_HALF_FOV = Math.tan((FIELD_OF_VIEW / 360) * Math.PI);
// Horizon height until the hero measures where its title ends, as a share of the viewport measured from the bottom.
const HORIZON = 0.3;
// Scoping in leaves the planet: its horizon falls to this height, below the viewport.
const SCOPED_HORIZON = -0.34;
// The planet is a circle sized in viewport widths, so its arc keeps one shape at every aspect ratio; scoping in tightens it toward the limb.
const PLANET_RADIUS = 1.5;
const LIMB_RADIUS = 0.9;
// Release order runs across this share of the viewport's width, starting this far in from its left edge.
const RELEASE_LEFT = 0.07;
const RELEASE_SPAN = 0.8;
// Stars fill the sky above the horizon, as shares of its height: the weakest hang just over the glow and the strongest top out below the header.
const STAR_FLOOR = 0.06;
const STAR_CEILING = 0.29;
// A star's sprite spans this many times its size; frontier sprites span more to hold their rays.
const STAR_SPRITE = 3;
const FRONTIER_SPRITE = 7;
// Each star floats on its own slow path, up to twice this many CSS pixels from its place, so the sky never moves as one layer.
const STAR_WANDER = 2.5;
// Stars within this many CSS pixels of the pointer lean toward it, by at most 4/27 of GRAVITY pixels a third of the way out; the lean fades to nothing at the pointer itself, so a star under it stays put to be explored.
const GRAVITY_REACH = 200;
const GRAVITY = 90;
// Motes lean less than stars, and follow the pointer with this time constant in seconds.
const DUST_GRAVITY = 0.6;
const POINTER_EASE = 0.12;
const DUST = 1_400;
// Each mote floats on its own path too, by up to this share of the sky's half-height.
const DUST_WANDER = 0.008;
// Moving dust smears over this much of a second, and no further than this many CSS pixels.
const SHUTTER = 1 / 60;
const MAX_STREAK = 14;
// Depth band of model stars; the camera never travels past the nearest of them.
const NEAREST_STAR = -2;
const STAR_DEPTH = 10;
// The opening replays release order: starting this far into it, a sweep crosses the sky over this share of it, igniting each star as it passes the star's release position, so the newest frontier lights last.
const IGNITION_START = 0.2;
const IGNITION_SWEEP = 0.58;
// After the opening, a pulse of light runs along the rim from left to right once every this many seconds, taking this long to cross.
const RIM_PULSE_PERIOD = 15;
const RIM_PULSE_CROSSING = 2.5;
// Time constant, in seconds, of the explored star's flare.
const FLARE_EASE = 0.08;

export type SkyStar = {
  key: string;
  /** Release-date position from 0 (oldest) to 1 (newest). */
  across: number;
  /** Intelligence from 0 to 1, drawn as height above the horizon and as brightness. */
  altitude: number;
  colour: string;
  /** Frontier-role models carry a name and diffraction spikes. */
  label: string | null;
  /** Identification shown when the star is explored. */
  name: string;
  provider: string;
  intelligence: number;
  released: string;
};

/** Where a named frontier star currently appears, in CSS pixels, with its label's fade. */
export type SkyLabel = { label: string; x: number; y: number; opacity: number };

export type SkyFrame = {
  /** Seconds of ambient motion; frozen while the page is hidden or under reduced motion. */
  time: number;
  /** Seconds since the previous rendered frame, which transitions ease over; Infinity for a first frame or under reduced motion, so they snap. */
  elapsed: number;
  /** Opening progress from 0 to 1. */
  intro: number;
  /** Hero progress from 0 (at rest) to 1 (scrolled away); always 0 under reduced motion. */
  progress: number;
  /** Share of the page below the hero that has been scrolled; always 0 under reduced motion. */
  flight: number;
  scroll: number;
  unitsPerPixel: number;
  width: number;
  height: number;
  /** The pointer in CSS pixels while it rests over the hero; null elsewhere or under reduced motion. */
  pointer: { x: number; y: number } | null;
};

/** A star's place on the chart, the slow path it wanders around that place, and the pointer's pull on it, with where they have carried it this frame. */
type PlacedStar = {
  rest: THREE.Vector3;
  world: THREE.Vector3;
  /** World units per CSS pixel at the star's depth, from the hero camera. */
  scale: number;
  rateX: number;
  rateY: number;
  phaseX: number;
  phaseY: number;
  /** Time constant, in seconds, of the star answering the pointer, its own so a neighbourhood never moves in lockstep. */
  ease: number;
  /** The pointer's current pull, in CSS pixels on screen. */
  pullX: number;
  pullY: number;
};

// Every sky shader reads these constants as #defines, each written as a GLSL float.
const SKY_DEFINES = Object.fromEntries(
  Object.entries({
    CAMERA_DISTANCE,
    TAN_HALF_FOV,
    PLANET_RADIUS,
    LIMB_RADIUS,
    RELEASE_LEFT,
    RELEASE_SPAN,
    STAR_SPRITE,
    FRONTIER_SPRITE,
    GRAVITY_REACH,
    GRAVITY,
    DUST_GRAVITY,
    DUST_WANDER,
    MAX_STREAK,
    IGNITION_START,
    IGNITION_SWEEP,
    RIM_PULSE_PERIOD,
    RIM_PULSE_CROSSING,
  }).map(([name, value]) => [name, Number.isInteger(value) ? value.toFixed(1) : String(value)]),
);

const SHARED_GLSL = /* glsl */ `
uniform float time;
uniform float intro;
uniform float pixelRatio;
`;

// The planet's rim as a signed distance, shared by the horizon and by the dust it hides.
const PLANET_GLSL = /* glsl */ `
uniform vec2 resolution;
uniform float aspect;
uniform float horizon;
uniform float scope;

// How far scoping has tightened the arc toward the limb: 1 at rest, reaching the limb before the pan carries it below the viewport.
float planetShrink() {
  return pow(LIMB_RADIUS / PLANET_RADIUS, 1.0 - pow(1.0 - scope, 2.5));
}

// Distance from the rim in viewport heights, positive above it, while the radius is set in widths.
float rimDistance(vec2 uv, float shrink) {
  float radius = PLANET_RADIUS * shrink * aspect;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  return length(p - vec2(0.0, horizon - radius)) - radius;
}
`;

// A dark mound with a stippled, glowing rim under a cobalt sky; the rim shifts from cobalt to violet and rose toward the sides.
// It renders at full strength from the first frame because the dashboard's fade-in already reveals it.
// The opening's sweep lights the rim as it crosses with the igniting stars, and the same pulse of light runs along the rim every RIM_PULSE_PERIOD seconds after.
const HORIZON_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const HORIZON_FRAGMENT = /* glsl */ `
${SHARED_GLSL}
${PLANET_GLSL}
uniform float dawn;
varying vec2 vUv;

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(grainHash(i), grainHash(i + vec2(1.0, 0.0)), u.x), mix(grainHash(i + vec2(0.0, 1.0)), grainHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float clouds(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    total += amplitude * valueNoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  float shrink = planetShrink();
  float toRim = rimDistance(vUv, shrink);
  float across = vUv.x - 0.5;
  vec2 p = vec2(across * aspect, vUv.y);
  float side = clamp(abs(across) / (0.67 * shrink), 0.0, 1.0);
  vec3 rim = mix(vec3(0.42, 0.56, 1.0), vec3(0.64, 0.44, 1.0), smoothstep(0.1, 0.6, side));
  rim = mix(rim, vec3(1.0, 0.56, 0.72), smoothstep(0.55, 1.0, side));
  float breathe = (0.9 + 0.1 * sin(time * 0.4)) * dawn;
  float sweep = (intro - IGNITION_START) / IGNITION_SWEEP;
  float sweepOffset = (vUv.x - RELEASE_LEFT - sweep * RELEASE_SPAN) * aspect / 0.05;
  // The first period holds no pulse, since the opening's sweep has just crossed; between crossings the pulse waits off screen to the right.
  float pulse = time < RIM_PULSE_PERIOD ? 9.0 : mod(time, RIM_PULSE_PERIOD) / RIM_PULSE_CROSSING;
  float pulseOffset = (vUv.x + 0.05 - pulse * 1.1) * aspect / 0.05;
  float passing = exp(-sweepOffset * sweepOffset) * smoothstep(0.0, 0.1, sweep) * smoothstep(1.1, 0.9, sweep) + exp(-pulseOffset * pulseOffset);
  float limbLight = 1.0 + exp(-abs(toRim) * 12.0 / shrink) * passing * 0.8;
  float inside = smoothstep(0.003, -0.003, toRim);
  vec3 sky = mix(vec3(0.05, 0.09, 0.38), vec3(0.006, 0.01, 0.045), smoothstep(horizon - 0.05, 1.0, vUv.y));
  sky += rim * exp(-max(toRim, 0.0) * 4.5 / shrink) * 0.42 * breathe * limbLight;
  // Faint nebulae fill the deep sky once the camera scopes past the horizon.
  float cloud = clouds(p * 1.4 + vec2(time * 0.008, scope * 0.6));
  sky += mix(vec3(0.24, 0.14, 0.56), vec3(0.08, 0.2, 0.62), cloud) * smoothstep(0.45, 0.85, cloud) * (0.07 + scope * 0.2);
  float lit = exp(-max(-toRim, 0.0) * 11.0 / shrink);
  float stipple = step(grainHash(gl_FragCoord.xy), lit * 0.85);
  vec3 mound = vec3(0.008, 0.01, 0.03) + rim * (0.12 * lit + 0.5 * stipple * lit) * breathe * limbLight;
  vec3 colour = mix(sky, mound, inside) + rim * exp(-abs(toRim) * 70.0) * 0.85 * breathe * limbLight;
  gl_FragColor = vec4(colour, 1.0);
}
`;

const STAR_VERTEX = /* glsl */ `
${SHARED_GLSL}
attribute vec3 tint;
attribute float size;
attribute float seed;
attribute float frontier;
attribute float ignition;
varying vec3 vTint;
varying float vSize;
varying float vGlow;
varying float vFlash;
varying float vFrontier;
varying float vRays;
varying float vSeed;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  // Stars keep their hero size at the hero distance and grow as the camera scopes in.
  float approach = (CAMERA_DISTANCE - position.z) / -view.z;
  float lit = intro - ignition;
  // Two beating rates, so no two stars pulse alike.
  float twinkle = 0.86 + 0.09 * sin(time * (1.1 + seed * 2.0) + seed * 50.0) + 0.05 * sin(time * (2.7 + seed * 3.1) + seed * 23.0);
  gl_PointSize = size * pixelRatio * approach * mix(STAR_SPRITE, FRONTIER_SPRITE, frontier);
  vTint = tint;
  vSize = gl_PointSize;
  vGlow = smoothstep(0.0, 0.04, lit) * twinkle;
  vFlash = step(0.0, lit) * exp(-max(lit, 0.0) * 16.0);
  vFrontier = frontier;
  vRays = smoothstep(0.01, 0.16, lit);
  vSeed = seed;
}
`;

// A white-hot core in a corona of the provider's colour; frontier roles add long rays whose tips disperse red beyond blue and along which light runs slowly outward.
const STAR_FRAGMENT = /* glsl */ `
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
const FLARE_VERTEX = /* glsl */ `
${SHARED_GLSL}
uniform float flare;
uniform float flareSize;
varying float vGlow;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = flareSize * pixelRatio * (CAMERA_DISTANCE - position.z) / -view.z;
  vGlow = flare;
}
`;

const FLARE_FRAGMENT = /* glsl */ `
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

// Dust wraps around the camera in depth and height, so the scoped flight never runs out of stars.
// Each mote is also placed where the previous frame's camera saw it, so a moving mote smears along its own path.
const DUST_VERTEX = /* glsl */ `
${SHARED_GLSL}
attribute float seed;
uniform vec2 resolution;
uniform float aspect;
uniform float rise;
uniform vec3 previousCamera;
uniform mat4 previousView;
uniform float previousRise;
uniform float shutter;
uniform vec2 pointer;
uniform float pull;
varying float vGlow;
varying vec2 vStreak;
varying float vRadius;

vec3 place(vec3 camera, float lift, out float distance) {
  distance = mod(position.z + camera.z, 34.0) + 0.6;
  float halfHeight = distance * TAN_HALF_FOV;
  float span = halfHeight * 2.4;
  vec2 wander = vec2(sin(time * (0.3 + seed * 0.3) + seed * 40.0), sin(time * (0.25 + fract(seed * 7.31) * 0.3) + seed * 23.0)) * DUST_WANDER;
  float y = camera.y + mod((position.y + wander.y) * halfHeight * 1.2 + lift + span * 0.5, span) - span * 0.5;
  return vec3(camera.x + (position.x + wander.x) * halfHeight * aspect * 1.15, y, camera.z - distance);
}

void main() {
  float distance;
  gl_Position = projectionMatrix * viewMatrix * vec4(place(cameraPosition, rise, distance), 1.0);
  float before;
  vec4 previous = projectionMatrix * previousView * vec4(place(previousCamera, previousRise, before), 1.0);
  vec2 motion = (gl_Position.xy / gl_Position.w - previous.xy / previous.w) * 0.5 * resolution * shutter;
  float limit = MAX_STREAK * pixelRatio;
  // A mote that wrapped around the camera jumped rather than moved, so it leaves no streak.
  if (abs(distance - before) > 1.0 || length(motion) > limit * 6.0) motion = vec2(0.0);
  motion *= min(1.0, limit / max(length(motion), 0.001));
  float scale = clamp(14.0 / distance, 0.6, 2.4);
  float size = mix(1.0, 2.6, seed) * pixelRatio * scale;
  float streak = length(motion);
  gl_PointSize = size + streak;
  vStreak = vec2(motion.x, -motion.y) * 0.5 / gl_PointSize;
  vRadius = 0.5 * size / gl_PointSize;
  // Motes near the pointer lean toward it as the model stars do, the lean fading in and out with the pointer.
  vec2 viewport = resolution / pixelRatio;
  vec2 toward = pointer - vec2(gl_Position.x / gl_Position.w * 0.5 + 0.5, 0.5 - gl_Position.y / gl_Position.w * 0.5) * viewport;
  float reach = length(toward) / GRAVITY_REACH;
  if (reach < 1.0 && pull > 0.0) {
    vec2 lean = toward / max(length(toward), 0.001) * GRAVITY * DUST_GRAVITY * reach * (1.0 - reach) * (1.0 - reach) * pull;
    gl_Position.xy += vec2(lean.x, -lean.y) * 2.0 / viewport * gl_Position.w;
  }
  float twinkle = 0.55 + 0.45 * sin(time * (0.6 + seed * 1.6) + seed * 70.0);
  // Near motes blur into dimmer discs and streaks spread their light, so neither outshines the model stars.
  float spread = mix(1.0, 0.5, smoothstep(1.0, 2.4, scale)) * size / (size + streak);
  vGlow = twinkle * spread * smoothstep(0.0, 0.25, intro) * smoothstep(34.0, 20.0, distance);
}
`;

const DUST_FRAGMENT = /* glsl */ `
${PLANET_GLSL}
varying float vGlow;
varying vec2 vStreak;
varying float vRadius;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float along = clamp(dot(p, vStreak) / max(dot(vStreak, vStreak), 1e-6), -1.0, 1.0);
  float falloff = smoothstep(1.0, 0.1, length(p - vStreak * along) / vRadius);
  // The planet is solid: motes set behind its rim and dim through its atmosphere.
  float shrink = planetShrink();
  float clear = smoothstep(0.0, 0.03 * shrink, rimDistance(gl_FragCoord.xy / resolution, shrink));
  gl_FragColor = vec4(vec3(0.7, 0.78, 1.0) * falloff * vGlow * clear * 0.75, 1.0);
}
`;

/** Stars are placed by their hero screen position at their own depth, so the opening composition is exact while scrolling still produces true parallax. */
export function createSky(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const uniforms = {
    time: { value: 0 },
    intro: { value: 0 },
    pixelRatio: { value: pixelRatio },
    resolution: { value: new THREE.Vector2(1, 1) },
    aspect: { value: 1 },
    horizon: { value: HORIZON },
    dawn: { value: 1 },
    scope: { value: 0 },
    rise: { value: 0 },
  };
  const additive = {
    uniforms,
    defines: SKY_DEFINES,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };

  const horizonMaterial = new THREE.ShaderMaterial({
    vertexShader: HORIZON_VERTEX,
    fragmentShader: HORIZON_FRAGMENT,
    uniforms,
    defines: SKY_DEFINES,
    depthTest: false,
    depthWrite: false,
  });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), horizonMaterial);
  horizon.frustumCulled = false;
  horizon.renderOrder = -1;

  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(DUST * 3);
  const dustSeeds = new Float32Array(DUST);
  let state = 0x5ca1e;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let mote = 0; mote < DUST; mote++) {
    dustPositions[mote * 3] = random() * 2 - 1;
    dustPositions[mote * 3 + 1] = random() * 2 - 1;
    dustPositions[mote * 3 + 2] = random() * 34;
    dustSeeds[mote] = random();
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("seed", new THREE.BufferAttribute(dustSeeds, 1));
  const dustUniforms = {
    ...uniforms,
    previousCamera: { value: new THREE.Vector3() },
    previousView: { value: new THREE.Matrix4() },
    previousRise: { value: 0 },
    shutter: { value: 0 },
    pointer: { value: new THREE.Vector2() },
    pull: { value: 0 },
  };
  const dustMaterial = new THREE.ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    ...additive,
    uniforms: dustUniforms,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;

  const starGeometry = new THREE.BufferGeometry();
  const starMaterial = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    ...additive,
  });
  const starPoints = new THREE.Points(starGeometry, starMaterial);
  starPoints.frustumCulled = false;
  // A flare marks the star being explored or the role hovered in the register, and fades out where it last stood.
  const focusGeometry = new THREE.BufferGeometry();
  focusGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  const focusUniforms = {
    ...uniforms,
    flare: { value: 0 },
    flareSize: { value: 64 },
    flareTint: { value: new THREE.Color() },
  };
  const focusMaterial = new THREE.ShaderMaterial({
    vertexShader: FLARE_VERTEX,
    fragmentShader: FLARE_FRAGMENT,
    ...additive,
    uniforms: focusUniforms,
  });
  const focus = new THREE.Points(focusGeometry, focusMaterial);
  focus.frustumCulled = false;
  scene.add(horizon, dust, starPoints, focus);

  let stars: SkyStar[] = [];
  let placed: PlacedStar[] = [];
  let starPositions = new THREE.BufferAttribute(new Float32Array(0), 3);
  let focused: number | null = null;
  let named: { label: string; index: number; ignition: number }[] = [];
  let width = 1;
  let height = 1;
  let scope = 0;
  let horizonTop: number | null = null;
  let flare = 0;
  let stirring = false;
  const pointerTarget = new THREE.Vector2();
  const colour = new THREE.Color();
  const projected = new THREE.Vector3();

  /** Hero horizon height as a share of the viewport from the bottom. */
  const restingHorizon = () => (horizonTop == null ? HORIZON : 1 - horizonTop / height);

  const layout = () => {
    const unitsPerPixel = (2 * CAMERA_DISTANCE * TAN_HALF_FOV) / height;
    const sky = height * (1 - restingHorizon());
    const positions = new Float32Array(stars.length * 3);
    const tints = new Float32Array(stars.length * 3);
    const sizes = new Float32Array(stars.length);
    const seeds = new Float32Array(stars.length);
    const frontiers = new Float32Array(stars.length);
    const ignitions = new Float32Array(stars.length);
    named = [];
    placed = stars.map((star, index) => {
      const seed = hashUnit(star.key);
      const depth = NEAREST_STAR - seed * STAR_DEPTH;
      const perspective = (CAMERA_DISTANCE - depth) / CAMERA_DISTANCE;
      const screenX = width * (RELEASE_LEFT + star.across * RELEASE_SPAN);
      const screenY =
        sky * (1 - STAR_FLOOR - star.altitude ** 1.2 * (1 - STAR_FLOOR - STAR_CEILING));
      const x = (screenX - width / 2) * unitsPerPixel * perspective;
      const y = -(screenY - height / 2) * unitsPerPixel * perspective;
      const ignition = IGNITION_START + star.across * IGNITION_SWEEP;
      positions.set([x, y, depth], index * 3);
      colour.set(star.colour);
      tints.set([colour.r, colour.g, colour.b], index * 3);
      sizes[index] = (2.2 + star.altitude ** 1.5 * 5.5) * (star.label == null ? 1 : 1.2);
      seeds[index] = seed;
      frontiers[index] = star.label == null ? 0 : 1;
      ignitions[index] = ignition;
      if (star.label != null) named.push({ label: star.label, index, ignition });
      // Each star wanders with its own periods of 5 to 11 seconds and answers the pointer within 0.15 to 0.5 seconds.
      const pathX = hashUnit(`${star.key}:x`);
      const pathY = hashUnit(`${star.key}:y`);
      return {
        rest: new THREE.Vector3(x, y, depth),
        world: new THREE.Vector3(x, y, depth),
        scale: unitsPerPixel * perspective,
        rateX: (2 * Math.PI) / (5 + 4 * pathX),
        rateY: (2 * Math.PI) / (6 + 5 * pathY),
        phaseX: pathX * 40,
        phaseY: pathY * 40,
        ease: 0.15 + 0.35 * hashUnit(`${star.key}:pull`),
        pullX: 0,
        pullY: 0,
      };
    });
    starPositions = new THREE.BufferAttribute(positions, 3);
    starGeometry.setAttribute("position", starPositions);
    starGeometry.setAttribute("tint", new THREE.BufferAttribute(tints, 3));
    starGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    starGeometry.setAttribute("frontier", new THREE.BufferAttribute(frontiers, 1));
    starGeometry.setAttribute("ignition", new THREE.BufferAttribute(ignitions, 1));
    placeFocus();
  };

  /** The focused star and where it stands this frame, if one is focused. */
  const focusTarget = () => {
    const star = focused == null ? undefined : stars[focused];
    const world = focused == null ? undefined : placed[focused]?.world;
    return star == null || world == null ? null : { star, world };
  };

  const placeFocus = () => {
    const target = focusTarget();
    if (target == null) return;
    focusGeometry
      .getAttribute("position")
      .setXYZ(0, target.world.x, target.world.y, target.world.z);
    focusGeometry.getAttribute("position").needsUpdate = true;
    focusUniforms.flareTint.value.set(target.star.colour);
  };

  /** Current CSS-pixel position of a world point, after the latest camera update. */
  const screenOf = (point: THREE.Vector3) => {
    projected.copy(point).project(camera);
    return { x: (projected.x * 0.5 + 0.5) * width, y: (0.5 - projected.y * 0.5) * height };
  };

  return {
    setStars(next: SkyStar[]) {
      stars = next;
      layout();
    },
    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
      uniforms.aspect.value = width / height;
      uniforms.resolution.value.set(
        Math.floor(width * pixelRatio),
        Math.floor(height * pixelRatio),
      );
      layout();
    },
    /** Where the hero horizon sits, in CSS pixels from the top of the viewport at rest; null keeps the default height. */
    setHorizon(top: number | null) {
      horizonTop = top;
      layout();
    },
    stars: () => stars,
    /** The star nearest a pointer position, if any lies within reach in CSS pixels. */
    nearest(x: number, y: number, reach: number): number | null {
      camera.updateMatrixWorld();
      let best: number | null = null;
      let bestDistance = reach;
      placed.forEach(({ world }, index) => {
        const point = screenOf(world);
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      return best;
    },
    setFocus(index: number | null) {
      focused = index == null || index >= placed.length ? null : index;
      placeFocus();
    },
    /** Screen position of the focused star, for its identification card. */
    focusPoint() {
      const target = focusTarget();
      if (target == null) return null;
      camera.updateMatrixWorld();
      return { star: target.star, ...screenOf(target.world) };
    },
    /** Screen positions of named frontier stars for the DOM labels, after the latest camera update; names hold their stars' resting places, so they stay steady while the stars wander and lean, and appear as each star ignites. */
    labels(): SkyLabel[] {
      camera.updateMatrixWorld();
      const scoped = clamp01(1 - scope * 1.6);
      return named.flatMap(({ label, index, ignition }) => {
        const rest = placed[index]?.rest;
        if (rest == null) return [];
        return [
          {
            label,
            ...screenOf(rest),
            opacity: scoped * smoothstep((uniforms.intro.value - ignition - 0.04) / 0.12),
          },
        ];
      });
    },
    /** Whether the flare or the pointer's pull is still settling, so the field keeps rendering until they rest. */
    settling() {
      return stirring || Math.abs((focused == null ? 0 : 1) - flare) > 0.002;
    },
    update(frame: SkyFrame) {
      // The camera as last rendered, from which each mote's streak is measured.
      dustUniforms.previousView.value.copy(camera.matrixWorldInverse);
      dustUniforms.previousCamera.value.setFromMatrixPosition(camera.matrixWorld);
      dustUniforms.previousRise.value = uniforms.rise.value;
      dustUniforms.shutter.value =
        frame.elapsed > 0.1 ? 0 : SHUTTER / Math.max(frame.elapsed, 1 / 240);
      scope = smoothstep(frame.progress);
      uniforms.time.value = frame.time;
      uniforms.intro.value = frame.intro;
      // The planet falls away and dims as the camera tilts up and scopes into the sky; its curve tightens in the shader.
      const resting = restingHorizon();
      uniforms.horizon.value = resting + (SCOPED_HORIZON - resting) * scope ** 1.15;
      uniforms.dawn.value = 1 - scope * 0.85;
      uniforms.scope.value = scope;
      uniforms.rise.value = frame.scroll * frame.unitsPerPixel * 0.35;
      camera.position.z = CAMERA_DISTANCE - scope * 5 - clamp01(frame.flight) * 4.2;
      camera.rotation.x = scope * 0.16;
      camera.updateMatrixWorld();
      const settle = (ease: number) => 1 - Math.exp(-frame.elapsed / ease);
      const { pointer } = frame;
      // Motes follow a smoothed pointer, starting where it enters, and their lean fades out where it leaves.
      if (pointer != null) {
        pointerTarget.set(pointer.x, pointer.y);
        if (dustUniforms.pull.value < 0.01) dustUniforms.pointer.value.copy(pointerTarget);
        dustUniforms.pointer.value.lerp(pointerTarget, settle(POINTER_EASE));
      }
      const presence = pointer == null ? 0 : 1;
      dustUniforms.pull.value += (presence - dustUniforms.pull.value) * settle(POINTER_EASE * 2);
      stirring = Math.abs(presence - dustUniforms.pull.value) > 0.002;
      placed.forEach((star, index) => {
        let leanX = 0;
        let leanY = 0;
        if (pointer != null) {
          const at = screenOf(star.rest);
          const towardX = pointer.x - at.x;
          const towardY = pointer.y - at.y;
          const distance = Math.hypot(towardX, towardY);
          const reach = distance / GRAVITY_REACH;
          if (reach < 1 && distance > 0) {
            const lean = (GRAVITY * reach * (1 - reach) ** 2) / distance;
            leanX = towardX * lean;
            leanY = towardY * lean;
          }
        }
        star.pullX += (leanX - star.pullX) * settle(star.ease);
        star.pullY += (leanY - star.pullY) * settle(star.ease);
        stirring ||= Math.abs(leanX - star.pullX) + Math.abs(leanY - star.pullY) > 0.05;
        // Paths start at each star's place, so a still sky shows every star exactly where the chart puts it.
        const wanderX =
          STAR_WANDER * (Math.sin(frame.time * star.rateX + star.phaseX) - Math.sin(star.phaseX));
        const wanderY =
          STAR_WANDER * (Math.sin(frame.time * star.rateY + star.phaseY) - Math.sin(star.phaseY));
        star.world.set(
          star.rest.x + (wanderX + star.pullX) * star.scale,
          star.rest.y + (wanderY - star.pullY) * star.scale,
          star.rest.z,
        );
        starPositions.setXYZ(index, star.world.x, star.world.y, star.world.z);
      });
      starPositions.needsUpdate = true;
      placeFocus();
      flare += ((focused == null ? 0 : 1) - flare) * (1 - Math.exp(-frame.elapsed / FLARE_EASE));
      focusUniforms.flare.value = flare;
    },
    dispose() {
      scene.remove(horizon, dust, starPoints, focus);
      horizon.geometry.dispose();
      horizonMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      focusGeometry.dispose();
      focusMaterial.dispose();
    },
  };
}

/** Stable depth for a model key, so a star keeps its place across reloads and filter changes. */
function hashUnit(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
