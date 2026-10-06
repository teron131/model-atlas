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
// Stars fill the sky above the horizon, as shares of its height: the weakest hang just over the glow and the strongest top out below the header.
const STAR_FLOOR = 0.06;
const STAR_CEILING = 0.29;
const DUST = 1_400;
// Depth band of model stars; the camera never travels past the nearest of them.
const NEAREST_STAR = -2;
const STAR_DEPTH = 10;

/** One model as a star: release date runs across the sky and Intelligence sets its height over the horizon. */
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
};

const SHARED_GLSL = /* glsl */ `
uniform float time;
uniform float intro;
uniform float pixelRatio;
`;

// A dark mound with a stippled, glowing rim under a cobalt sky; the rim shifts from cobalt to violet and rose toward the sides.
// It renders at full strength from the first frame because the CSS atmosphere already shows the same horizon; only the stars play the opening.
const HORIZON_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const HORIZON_FRAGMENT = /* glsl */ `
${SHARED_GLSL}
uniform float aspect;
uniform float horizon;
uniform float dawn;
uniform float scope;
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
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y);
  float across = vUv.x - 0.5;
  // Tighten the visible arc before the pan carries it below the viewport.
  float curveScope = 1.0 - pow(1.0 - scope, 2.5);
  float shrink = pow(${(LIMB_RADIUS / PLANET_RADIUS).toFixed(4)}, curveScope);
  // Distances run in viewport heights, while the radius is set in widths.
  float radius = ${PLANET_RADIUS.toFixed(2)} * shrink * aspect;
  float side = clamp(abs(across) / (0.67 * shrink), 0.0, 1.0);
  vec3 rim = mix(vec3(0.42, 0.56, 1.0), vec3(0.64, 0.44, 1.0), smoothstep(0.1, 0.6, side));
  rim = mix(rim, vec3(1.0, 0.56, 0.72), smoothstep(0.55, 1.0, side));
  float breathe = (0.9 + 0.1 * sin(time * 0.4)) * dawn;
  float toRim = length(p - vec2(0.0, horizon - radius)) - radius;
  float inside = smoothstep(0.003, -0.003, toRim);
  vec3 sky = mix(vec3(0.05, 0.09, 0.38), vec3(0.006, 0.01, 0.045), smoothstep(horizon - 0.05, 1.0, vUv.y));
  sky += rim * exp(-max(toRim, 0.0) * 4.5 / shrink) * 0.42 * breathe;
  // Faint nebulae fill the deep sky once the camera scopes past the horizon.
  float cloud = clouds(p * 1.4 + vec2(time * 0.008, scope * 0.6));
  sky += mix(vec3(0.24, 0.14, 0.56), vec3(0.08, 0.2, 0.62), cloud) * smoothstep(0.45, 0.85, cloud) * (0.07 + scope * 0.2);
  float lit = exp(-max(-toRim, 0.0) * 11.0 / shrink);
  float stipple = step(grainHash(gl_FragCoord.xy), lit * 0.85);
  vec3 mound = vec3(0.008, 0.01, 0.03) + rim * (0.12 * lit + 0.5 * stipple * lit) * breathe;
  vec3 colour = mix(sky, mound, inside) + rim * exp(-abs(toRim) * 70.0) * 0.85 * breathe;
  gl_FragColor = vec4(colour, 1.0);
}
`;

const STAR_VERTEX = /* glsl */ `
${SHARED_GLSL}
attribute vec3 tint;
attribute float size;
attribute float seed;
attribute float frontier;
varying vec3 vTint;
varying float vGlow;
varying float vFrontier;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  // Stars keep their hero size at the hero distance and grow as the camera scopes in.
  float approach = (${CAMERA_DISTANCE.toFixed(1)} - position.z) / -view.z;
  float reveal = smoothstep(seed * 0.6, seed * 0.6 + 0.4, intro);
  float twinkle = 0.8 + 0.2 * sin(time * (1.1 + seed * 2.0) + seed * 50.0);
  gl_PointSize = size * pixelRatio * approach * mix(3.0, 5.0, frontier);
  vTint = tint;
  vGlow = reveal * twinkle;
  vFrontier = frontier;
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vTint;
varying float vGlow;
varying float vFrontier;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float radius = length(p) * 2.0;
  float core = exp(-radius * radius * mix(55.0, 80.0, vFrontier));
  float halo = exp(-radius * 5.5) * 0.32;
  float spikes = vFrontier * (exp(-abs(p.x) * 110.0) + exp(-abs(p.y) * 110.0)) * (1.0 - radius) * 0.7;
  vec3 colour = mix(vTint, vec3(1.0), 0.45) * core * 1.3 + vTint * halo + vec3(0.9, 0.94, 1.0) * spikes;
  gl_FragColor = vec4(colour * vGlow * smoothstep(1.0, 0.55, radius), 1.0);
}
`;

// The explored star flares: a wide halo and long tapered rays, never a ring or sight.
const FLARE_VERTEX = /* glsl */ `
${SHARED_GLSL}
uniform float flare;
uniform float flareSize;
varying float vGlow;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = flareSize * pixelRatio * (${CAMERA_DISTANCE.toFixed(1)} - position.z) / -view.z;
  vGlow = flare * smoothstep(0.55, 1.0, intro);
}
`;

const FLARE_FRAGMENT = /* glsl */ `
varying float vGlow;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float radius = length(p) * 2.0;
  float halo = exp(-radius * 4.2) * 0.5;
  float rays = (exp(-abs(p.x) * 150.0) + exp(-abs(p.y) * 150.0)) * pow(max(1.0 - radius, 0.0), 1.6);
  gl_FragColor = vec4(vec3(0.84, 0.88, 1.0) * (halo + rays * 0.8) * smoothstep(1.0, 0.6, radius) * vGlow, 1.0);
}
`;

const DUST_VERTEX = /* glsl */ `
${SHARED_GLSL}
attribute float seed;
uniform float aspect;
uniform float rise;
varying float vGlow;
void main() {
  // Dust wraps around the camera in depth and height, so the scoped flight never runs out of stars.
  float distance = mod(position.z + cameraPosition.z, 34.0) + 0.6;
  float z = cameraPosition.z - distance;
  float halfHeight = distance * ${TAN_HALF_FOV.toFixed(6)};
  float span = halfHeight * 2.4;
  float y = cameraPosition.y + mod(position.y * halfHeight * 1.2 + rise + span * 0.5, span) - span * 0.5;
  vec4 view = viewMatrix * vec4(cameraPosition.x + position.x * halfHeight * aspect * 1.15, y, z, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = mix(1.0, 2.6, seed) * pixelRatio * clamp(14.0 / distance, 0.6, 2.4);
  float twinkle = 0.55 + 0.45 * sin(time * (0.6 + seed * 1.6) + seed * 70.0);
  vGlow = twinkle * smoothstep(0.0, 0.5, intro) * smoothstep(34.0, 20.0, distance);
}
`;

const DUST_FRAGMENT = /* glsl */ `
varying float vGlow;
void main() {
  float falloff = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vec3(0.7, 0.78, 1.0) * falloff * vGlow * 0.75, 1.0);
}
`;

/**
 * Builds the horizon, dust, model stars, and the explored star's flare, and owns the camera choreography.
 *
 * Stars are placed by their hero screen position at their own depth, so the opening composition is exact while scrolling still produces true parallax.
 */
export function createSky(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const uniforms = {
    time: { value: 0 },
    intro: { value: 0 },
    pixelRatio: { value: pixelRatio },
    aspect: { value: 1 },
    horizon: { value: HORIZON },
    dawn: { value: 1 },
    scope: { value: 0 },
    rise: { value: 0 },
  };
  const additive = {
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };

  const horizonMaterial = new THREE.ShaderMaterial({
    vertexShader: HORIZON_VERTEX,
    fragmentShader: HORIZON_FRAGMENT,
    uniforms,
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
  const dustMaterial = new THREE.ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    ...additive,
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
  // A flare marks the star being explored or the role hovered in the register.
  const focusGeometry = new THREE.BufferGeometry();
  focusGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  const focusMaterial = new THREE.ShaderMaterial({
    vertexShader: FLARE_VERTEX,
    fragmentShader: FLARE_FRAGMENT,
    ...additive,
    uniforms: { ...uniforms, flare: { value: 0 }, flareSize: { value: 64 } },
  });
  const focus = new THREE.Points(focusGeometry, focusMaterial);
  focus.frustumCulled = false;
  scene.add(horizon, dust, starPoints, focus);

  let stars: SkyStar[] = [];
  let worlds: THREE.Vector3[] = [];
  let focused: number | null = null;
  let named: { label: string; position: THREE.Vector3 }[] = [];
  let width = 1;
  let height = 1;
  let scope = 0;
  let horizonTop: number | null = null;
  const colour = new THREE.Color();
  const projected = new THREE.Vector3();

  /** Hero horizon height as a share of the viewport from the bottom. */
  const restingHorizon = () => (horizonTop == null ? HORIZON : 1 - horizonTop / height);

  /** Recompute world positions so each star lands on its hero screen position at its own depth. */
  const layout = () => {
    const unitsPerPixel = (2 * CAMERA_DISTANCE * TAN_HALF_FOV) / height;
    const sky = height * (1 - restingHorizon());
    const positions = new Float32Array(stars.length * 3);
    const tints = new Float32Array(stars.length * 3);
    const sizes = new Float32Array(stars.length);
    const seeds = new Float32Array(stars.length);
    const frontiers = new Float32Array(stars.length);
    named = [];
    worlds = [];
    stars.forEach((star, index) => {
      const seed = hashUnit(star.key);
      const depth = NEAREST_STAR - seed * STAR_DEPTH;
      const perspective = (CAMERA_DISTANCE - depth) / CAMERA_DISTANCE;
      const screenX = width * (0.07 + star.across * 0.8);
      const screenY =
        sky * (1 - STAR_FLOOR - star.altitude ** 1.2 * (1 - STAR_FLOOR - STAR_CEILING));
      const x = (screenX - width / 2) * unitsPerPixel * perspective;
      const y = -(screenY - height / 2) * unitsPerPixel * perspective;
      positions.set([x, y, depth], index * 3);
      worlds.push(new THREE.Vector3(x, y, depth));
      colour.set(star.colour);
      tints.set([colour.r, colour.g, colour.b], index * 3);
      sizes[index] = (2.2 + star.altitude ** 1.5 * 5.5) * (star.label == null ? 1 : 1.2);
      seeds[index] = seed;
      frontiers[index] = star.label == null ? 0 : 1;
      if (star.label != null) {
        named.push({ label: star.label, position: new THREE.Vector3(x, y, depth) });
      }
    });
    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute("tint", new THREE.BufferAttribute(tints, 3));
    starGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    starGeometry.setAttribute("frontier", new THREE.BufferAttribute(frontiers, 1));
    placeFocus();
  };

  const placeFocus = () => {
    const world = focused == null ? undefined : worlds[focused];
    focusMaterial.uniforms.flare!.value = world == null ? 0 : 1;
    if (world != null) {
      focusGeometry.getAttribute("position").setXYZ(0, world.x, world.y, world.z);
      focusGeometry.getAttribute("position").needsUpdate = true;
    }
  };

  /** Current CSS-pixel position of a star, after the latest camera update. */
  const screenOf = (index: number) => {
    projected.copy(worlds[index]!).project(camera);
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
      for (let index = 0; index < worlds.length; index++) {
        const point = screenOf(index);
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
      return best;
    },
    setFocus(index: number | null) {
      focused = index == null || index >= worlds.length ? null : index;
      placeFocus();
    },
    /** Screen position of the focused star, for its identification card. */
    focusPoint() {
      if (focused == null) return null;
      camera.updateMatrixWorld();
      return { star: stars[focused]!, ...screenOf(focused) };
    },
    /** Screen positions of named frontier stars for the DOM labels, after the latest camera update. */
    labels(): SkyLabel[] {
      camera.updateMatrixWorld();
      const opacity = clamp01(1 - scope * 1.6) * smoothstep((uniforms.intro.value - 0.6) / 0.4);
      return named.map(({ label, position }) => {
        projected.copy(position).project(camera);
        return {
          label,
          x: (projected.x * 0.5 + 0.5) * width,
          y: (0.5 - projected.y * 0.5) * height,
          opacity,
        };
      });
    },
    update(frame: SkyFrame) {
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
