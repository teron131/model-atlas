/** Canvas renderer for the three interchangeable Model Atlas signature materials. */

import type { SignatureMode, SignatureModel } from "./models";
import { renderPhaseShader } from "./phase-shader";

export type MaterialPointer = {
  active: boolean;
  energy: number;
  phase: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

export type MaterialPalette = {
  background: string;
  ink: string;
  muted: string;
};

type MaterialFrame = {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mode: SignatureMode;
  models: SignatureModel[];
  pointer: MaterialPointer;
  palette: MaterialPalette;
};

type Point = {
  x: number;
  y: number;
};

type EvidencePoint = Point & {
  opacity: number;
};

type PhaseBuffer = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  height: number;
  image: ImageData;
  lastRenderTime: number;
  signature: string;
  width: number;
};

type TypeLayer = {
  canvas: HTMLCanvasElement;
  modelKey: string;
  top: number;
};

const GLYPHS = "·:+×#A7∴/\\<>[]{}";
const MATERIAL_MONO_FONT = '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace';
const MATERIAL_SANS_FONT = '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif';
const EVIDENCE_PARTICLE_COUNT = 9400;
const GOLDEN_RATIO_CONJUGATE = 0.61803398875;
const POINTER_RADIUS_RATIO = 0.14;
const PROVIDER_BLEND_EXPONENT = 0.78;
const evidenceBuffers = new WeakMap<CanvasRenderingContext2D, Float32Array>();
const phaseBuffers = new WeakMap<CanvasRenderingContext2D, PhaseBuffer>();
const typeLayers = new WeakMap<CanvasRenderingContext2D, TypeLayer[]>();

export function stepMaterialPointer(pointer: MaterialPointer, frameScale: number): void {
  const previousX = pointer.x;
  const previousY = pointer.y;
  const follow = 1 - Math.pow(0.28, frameScale);
  pointer.x += (pointer.targetX - pointer.x) * follow;
  pointer.y += (pointer.targetY - pointer.y) * follow;
  pointer.vx = pointer.vx * Math.pow(0.72, frameScale) + (pointer.x - previousX) * 0.48;
  pointer.vy = pointer.vy * Math.pow(0.72, frameScale) + (pointer.y - previousY) * 0.48;
  const speedEnergy = Math.min(1, Math.hypot(pointer.vx, pointer.vy) / 13);
  const targetEnergy = pointer.active ? Math.max(0.13, speedEnergy) : 0;
  const energyFollow = targetEnergy > pointer.energy ? 0.26 : 0.075;
  pointer.energy += (targetEnergy - pointer.energy) * (1 - Math.pow(1 - energyFollow, frameScale));
  pointer.phase += (0.07 + pointer.energy * 0.14) * frameScale;
}

export function renderMaterial(frame: MaterialFrame): void {
  if (frame.models.length === 0) {
    renderEmptyField(frame);
    return;
  }
  if (frame.mode === "field") {
    renderEvidenceField(frame);
  } else if (frame.mode === "phase") {
    renderPhaseLedger(frame);
  } else {
    renderSignalType(frame);
  }
}

function renderEvidenceField(frame: MaterialFrame): void {
  const { context, width, height, time, models, palette } = frame;
  const dark = isDarkColor(palette.background);
  const background = context.createLinearGradient(width * 0.2, 0, width, height * 0.7);
  background.addColorStop(0, palette.background);
  background.addColorStop(0.32, palette.background);
  background.addColorStop(1, dark ? "#18201f" : "#cfd2c9");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = dark ? "screen" : "multiply";
  models.forEach((model, modelIndex) => {
    const { agentic, mean, value } = model.parameters;
    const anchor = evidenceAnchor(modelIndex, width, height);
    const density = 0.94 * (0.48 + clamp01((mean - 0.5) / 0.25) * 0.5);
    const minimumWeight = 1.15 - density;
    const particleCount = Math.ceil(EVIDENCE_PARTICLE_COUNT / models.length);
    const particleBuffer = evidenceParticleBuffer(context, particleCount);
    context.fillStyle = palette.ink;
    for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
      const weight = 0.25 + noise(particleIndex + 131, modelIndex + 17) * 0.75;
      const bufferIndex = particleIndex * 4;
      particleBuffer[bufferIndex + 3] = weight;
      if (weight < minimumWeight) {
        continue;
      }
      const point = evidencePoint(frame, anchor, model, modelIndex, particleIndex, time);
      particleBuffer[bufferIndex] = point.x;
      particleBuffer[bufferIndex + 1] = point.y;
      particleBuffer[bufferIndex + 2] = point.opacity;
      const size = 1.53 * (0.68 + weight * 0.46);
      context.globalAlpha = 0.46 * point.opacity;
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }

    const providerMinimumWeight = Math.max(0.64 + (1 - value) * 0.08, minimumWeight);
    context.fillStyle = model.color;
    for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
      const bufferIndex = particleIndex * 4;
      const weight = particleBuffer[bufferIndex + 3] ?? 0;
      if (weight < providerMinimumWeight) {
        continue;
      }
      const size = 2.18 * (0.7 + weight * 0.4);
      const x = particleBuffer[bufferIndex] ?? 0;
      const y = particleBuffer[bufferIndex + 1] ?? 0;
      context.globalAlpha = 0.74 * (particleBuffer[bufferIndex + 2] ?? 0);
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }

    context.textAlign = "center";
    context.textBaseline = "middle";
    const glyphCount = Math.round(38 + clamp01((mean - 0.5) / 0.25) * 24 + agentic * 12);
    const glyphCadence = Math.round(16 - value * 7);
    const glyphTotal = glyphCount * (models.length <= 3 ? 5 : 4);
    for (const emphasized of [false, true]) {
      context.font = `${emphasized ? 12 : 8.5}px ${MATERIAL_MONO_FONT}`;
      context.fillStyle = emphasized ? model.color : palette.ink;
      for (let glyphIndex = 0; glyphIndex < glyphTotal; glyphIndex += 1) {
        if ((glyphIndex % glyphCadence === 0) !== emphasized) {
          continue;
        }
        const u = fractional(
          glyphIndex * GOLDEN_RATIO_CONJUGATE + modelIndex * 0.173 + time * 0.0007,
        );
        const dispersion = pseudoGaussian(glyphIndex + 211, modelIndex + 41) * 5.2;
        const phase = noise(glyphIndex + 307, modelIndex + 67) * Math.PI * 2;
        const point = evidenceBandPoint(frame, anchor, model, u, dispersion, phase, time);
        const opacity =
          evidenceOpacity(u) * (0.28 + noise(glyphIndex + 401, modelIndex + 73) * 0.72);
        context.globalAlpha = emphasized ? 0.82 * opacity : 0.27 * opacity;
        context.fillText(
          GLYPHS[(glyphIndex + modelIndex * 5) % GLYPHS.length] ?? "·",
          point.x,
          point.y,
        );
      }
    }
    context.globalAlpha = 1;
  });
  context.restore();
  drawMaterialAnnotations(frame);
}

function evidencePoint(
  frame: MaterialFrame,
  anchor: Point,
  model: SignatureModel,
  modelIndex: number,
  particleIndex: number,
  time: number,
): EvidencePoint {
  const { speed } = model.parameters;
  const u = fractional(
    noise(particleIndex + 11, modelIndex + 31) + time * 0.003 * (0.4 + speed) + modelIndex * 0.013,
  );
  const phase = noise(particleIndex + 79, modelIndex + 53) * Math.PI * 2;
  const gaussian = pseudoGaussian(particleIndex + 29, modelIndex) * 5.8;
  return {
    ...evidenceBandPoint(frame, anchor, model, u, gaussian, phase, time),
    opacity: evidenceOpacity(u),
  };
}

function evidenceBandPoint(
  frame: MaterialFrame,
  anchor: Point,
  model: SignatureModel,
  u: number,
  dispersion: number,
  phase: number,
  time: number,
): Point {
  const { agentic, context, intelligence, speed, value } = model.parameters;
  const compact = frame.width < 720;
  const longitudinal = (u - 0.5) * 2;
  const envelope = Math.sqrt(Math.max(0, 1 - longitudinal * longitudinal));
  const span = frame.width * (compact ? 0.24 + context * 0.05 : 0.33 + context * 0.075);
  const arch = Math.sin(u * Math.PI);
  const macroWave = Math.sin(u * (4.4 + value * 1.8) + model.rank * 1.37);
  const x =
    anchor.x +
    longitudinal * span +
    Math.sin(phase * 1.7 + u * 7) * span * (0.015 + agentic * 0.02) * envelope;
  const y =
    anchor.y +
    longitudinal * frame.height * (0.018 + agentic * 0.03) -
    arch * frame.height * (0.025 + intelligence * 0.04) +
    macroWave * envelope * frame.height * (0.018 + agentic * 0.014) +
    dispersion *
      envelope *
      frame.height *
      (compact ? 0.014 + context * 0.02 : 0.022 + context * 0.032) *
      (0.82 + agentic * 0.28) +
    Math.sin(u * (15 + value * 6) + phase + time * (0.42 + speed)) *
      envelope *
      frame.height *
      0.007;
  return disturb(frame, x, y, 0.044 + speed * 0.014);
}

function evidenceOpacity(u: number): number {
  return 0.12 + Math.pow(Math.max(0, Math.sin(u * Math.PI)), 0.48) * 0.88;
}

function evidenceParticleBuffer(
  context: CanvasRenderingContext2D,
  particleCount: number,
): Float32Array {
  const requiredLength = particleCount * 4;
  const existing = evidenceBuffers.get(context);
  if (existing != null && existing.length >= requiredLength) {
    return existing;
  }
  const buffer = new Float32Array(requiredLength);
  evidenceBuffers.set(context, buffer);
  return buffer;
}

function renderPhaseLedger(frame: MaterialFrame): void {
  drawPhaseSurface(frame);
  drawPhaseCalibration(frame);
  drawMaterialAnnotations(frame);
}

function drawPhaseSurface(frame: MaterialFrame): void {
  const { context, width, height, time, models, palette, pointer } = frame;
  const shaderRendered = renderPhaseShader({
    context,
    dark: isDarkColor(palette.background),
    height,
    models: models.map((model, modelIndex) => {
      const point = modelPoint(modelIndex, models.length, width, height);
      const { agentic, context, intelligence, speed, mean, value } = model.parameters;
      return {
        agentic,
        color: colorChannels(model.color),
        context,
        intelligence,
        mean,
        speed,
        value,
        x: point.x / width,
        y: point.y / height,
      };
    }),
    pointer,
    time: time * 2.4,
    width,
  });
  if (shaderRendered) {
    return;
  }

  const bufferWidth = Math.min(480, Math.max(240, Math.round(width * 0.36)));
  const bufferHeight = Math.max(1, Math.round((bufferWidth * height) / width));
  const buffer = phaseBuffer(context, bufferWidth, bufferHeight);
  const signature = models
    .map((model) => `${model.key}:${model.color}:${Object.values(model.parameters).join(":")}`)
    .join("|");
  if (signature !== buffer.signature || time - buffer.lastRenderTime >= 0.018) {
    const data = buffer.image.data;
    const aspect = width / height;
    const dark = isDarkColor(palette.background);
    const pointerX = pointer.x / Math.max(1, width);
    const pointerY = pointer.y / Math.max(1, height);
    const pointerVelocityX = (pointer.vx / Math.max(1, width)) * aspect;
    const pointerVelocityY = pointer.vy / Math.max(1, height);
    const modelFields = models.map((model, modelIndex) => {
      const point = modelPoint(modelIndex, models.length, width, height);
      return {
        model,
        x: point.x / width,
        y: point.y / height,
        color: colorChannels(model.color),
      };
    });

    for (let bufferY = 0; bufferY < bufferHeight; bufferY += 1) {
      for (let bufferX = 0; bufferX < bufferWidth; bufferX += 1) {
        let u = bufferX / Math.max(1, bufferWidth - 1);
        let v = bufferY / Math.max(1, bufferHeight - 1);
        const pointerDx = (u - pointerX) * aspect;
        const pointerDy = v - pointerY;
        const pointerDistanceSquared = pointerDx * pointerDx + pointerDy * pointerDy;
        let pointerWave = 0;
        let pointerStrength = 0;
        if (
          pointer.energy >= 0.002 &&
          pointerDistanceSquared < POINTER_RADIUS_RATIO * POINTER_RADIUS_RATIO * 4
        ) {
          const pointerDistance = Math.sqrt(pointerDistanceSquared);
          const inversePointerDistance = 1 / Math.max(pointerDistance, 0.001);
          const pointerDirectionX = pointerDx * inversePointerDistance;
          const pointerDirectionY = pointerDy * inversePointerDistance;
          const pointerFalloff = Math.exp(
            -Math.pow(pointerDistance / POINTER_RADIUS_RATIO, 2) * 2.7,
          );
          pointerWave = Math.sin(
            (pointerDistance / POINTER_RADIUS_RATIO) * Math.PI * 2 * 3.6 - time * 4.2,
          );
          const pointerTangentX = -pointerDirectionY;
          const pointerTangentY = pointerDirectionX;
          pointerStrength = pointerFalloff * pointer.energy;
          const pointerVelocityAlongTangent =
            pointerVelocityX * pointerTangentX + pointerVelocityY * pointerTangentY;
          u +=
            (pointerDirectionX * pointerWave * 0.024 * pointerStrength +
              pointerTangentX * pointerVelocityAlongTangent * 0.024 * pointerStrength * 1.8) /
            aspect;
          v +=
            pointerDirectionY * pointerWave * 0.024 * pointerStrength +
            pointerTangentY * pointerVelocityAlongTangent * 0.024 * pointerStrength * 1.8;
        }

        const warp =
          Math.sin(u * 13 + time * 0.2) * Math.cos(v * 11 - time * 0.13) * 0.5 +
          Math.sin((u + v) * 19) * 0.22;
        let phase = u * 23 - v * 11 + warp * 8;
        phase += pointerWave * pointerStrength * 3.4;

        let strongest = 0;
        let providerWeight = 0;
        let providerRed = 0;
        let providerGreen = 0;
        let providerBlue = 0;
        let field = 0;
        for (const modelField of modelFields) {
          const { agentic, context, intelligence, speed, mean, value } =
            modelField.model.parameters;
          const scaleX = 0.2 + context * 0.03;
          const scaleY = 0.17 + context * 0.04;
          const dx = (u - modelField.x) / scaleX;
          const dy = (v - modelField.y) / scaleY;
          const local = Math.exp(-(dx * dx * 1.3 + dy * dy * 2.1));
          const wavelength = 7.5 + (68 - mean * 100) * 1.1;
          const separation = 4 + agentic * 5;
          const directional = dx * wavelength + dy * separation;
          field +=
            Math.sin(directional + time * (0.35 + speed * 0.55)) *
            local *
            intelligence *
            (0.8 + value * 0.4);
          strongest = Math.max(strongest, local);
          const blendWeight = Math.pow(local, PROVIDER_BLEND_EXPONENT);
          providerWeight += blendWeight;
          providerRed += (modelField.color[0] ?? 216) * blendWeight;
          providerGreen += (modelField.color[1] ?? 255) * blendWeight;
          providerBlue += (modelField.color[2] ?? 69) * blendWeight;
        }
        phase += field * 4.6;
        phase += Math.sin(u * 31 + v * 17 - time * 0.32) * 0.65;

        const wave = Math.abs(Math.sin(phase));
        const shoulder = smoothstep(0.91, 0.965, wave);
        const core = smoothstep(0.968, 0.994, wave);
        const haze = 0.1 + (Math.sin(u * 37 + v * 29 + time * 0.21) + 1) * 0.035;
        const base = (8 + haze * 16 + shoulder * 20 + core * 168) / 255;
        const tint =
          (shoulder * 0.035 + core * 0.48) *
          (0.5 + strongest * 0.5) *
          (providerWeight / Math.max(providerWeight, 0.00001));
        const neutral = dark
          ? [base, base + 4 / 255, base + 10 / 255]
          : [1 - base * 0.72, 1 - base * 0.68, 1 - base * 0.75];
        providerRed /= Math.max(providerWeight, 0.00001);
        providerGreen /= Math.max(providerWeight, 0.00001);
        providerBlue /= Math.max(providerWeight, 0.00001);
        const [neutralRed = 0, neutralGreen = 0, neutralBlue = 0] = neutral;
        const vignette = 1 - Math.hypot(u - 0.58, v - 0.48) * 0.08;
        const pixel = (bufferY * bufferWidth + bufferX) * 4;
        data[pixel] = clampChannel(
          (neutralRed + (providerRed / 255 - neutralRed) * tint) * vignette * 255,
        );
        data[pixel + 1] = clampChannel(
          (neutralGreen + (providerGreen / 255 - neutralGreen) * tint) * vignette * 255,
        );
        data[pixel + 2] = clampChannel(
          (neutralBlue + (providerBlue / 255 - neutralBlue) * tint) * vignette * 255,
        );
        data[pixel + 3] = 255;
      }
    }
    buffer.context.putImageData(buffer.image, 0, 0);
    buffer.lastRenderTime = time;
    buffer.signature = signature;
  }

  context.save();
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.filter = "blur(0.45px)";
  context.drawImage(buffer.canvas, 0, 0, width, height);
  context.restore();
}

function phaseBuffer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): PhaseBuffer {
  const existing = phaseBuffers.get(context);
  if (existing?.width === width && existing.height === height) {
    return existing;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const bufferContext = canvas.getContext("2d");
  if (bufferContext == null) {
    throw new Error("Unable to create the Phase Ledger rendering buffer.");
  }
  const buffer: PhaseBuffer = {
    canvas,
    context: bufferContext,
    height,
    image: bufferContext.createImageData(width, height),
    lastRenderTime: Number.NEGATIVE_INFINITY,
    signature: "",
    width,
  };
  phaseBuffers.set(context, buffer);
  return buffer;
}

function drawPhaseCalibration(frame: MaterialFrame): void {
  const { context, width, height, palette } = frame;
  context.save();
  context.strokeStyle = withAlpha(palette.ink, 0.07);
  context.fillStyle = withAlpha(palette.ink, 0.26);
  context.font = `9px ${MATERIAL_MONO_FONT}`;
  context.setLineDash([2, 9]);
  for (let x = width * 0.42; x < width; x += width * 0.075) {
    context.beginPath();
    context.moveTo(x, height * 0.1);
    context.lineTo(x, height * 0.9);
    context.stroke();
    context.fillText(String(Math.round((x / width) * 100)).padStart(2, "0"), x + 3, height * 0.115);
  }
  for (let y = height * 0.14; y < height * 0.9; y += height * 0.095) {
    context.beginPath();
    context.moveTo(width * 0.4, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function renderSignalType(frame: MaterialFrame): void {
  const { context, width, height, time, models, palette } = frame;
  const signalTime = time * 0.12;
  const compact = width < 720;
  const baseSize = compact ? Math.max(54, width * 0.16) : Math.max(88, width * 0.115);
  const background = context.createLinearGradient(width * 0.18, 0, width, height * 0.72);
  background.addColorStop(0, "#101012");
  background.addColorStop(1, "#28262a");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  context.lineWidth = 0.65;
  for (let lineIndex = 0; lineIndex < 34; lineIndex += 1) {
    context.strokeStyle = withAlpha(palette.muted, 0.025 + (lineIndex % 5) * 0.004);
    context.beginPath();
    for (let x = width * 0.4; x <= width; x += 10) {
      const baseline = height * (0.075 + lineIndex * 0.025);
      const y =
        baseline +
        Math.sin(x * 0.012 + lineIndex * 0.37 + signalTime * 0.16) * (8 + (lineIndex % 4) * 2) +
        Math.sin(x * 0.027 - signalTime * 0.11) * 3;
      if (x === width * 0.4) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
  }
  context.restore();

  const layers = signalTypeLayers(context, width, height, baseSize, models);
  models.forEach((model, modelIndex) => {
    const { agentic, intelligence, speed, mean, value } = model.parameters;
    const y = signalTypeY(compact, modelIndex, models.length, height);
    const fontSize = signalTypeFontSize(baseSize, model, models.length, width);
    const layer = layers[modelIndex];
    if (layer == null) {
      return;
    }

    context.save();
    context.globalCompositeOperation = "screen";
    context.strokeStyle = withAlpha(model.color, 0.34);
    context.lineWidth = 1.25;
    context.beginPath();
    for (let x = width * 0.4; x <= width; x += 8) {
      const carrier =
        Math.sin(x * (0.011 + mean * 0.01) + signalTime * (0.55 + speed)) *
          height *
          (0.024 + agentic * 0.018) +
        Math.sin(x * (0.018 + value * 0.01) - signalTime * 0.27) * height * 0.012;
      if (x === width * 0.4) {
        context.moveTo(x, y + carrier);
      } else {
        context.lineTo(x, y + carrier);
      }
    }
    context.stroke();
    context.restore();

    const density = context.canvas.width / Math.max(1, width);
    const stripHeight = 10 + Math.round((1 - value) * 4);
    for (let stripY = y - fontSize * 0.62; stripY < y + fontSize * 0.45; stripY += stripHeight) {
      const frequency = 0.022 + mean * 100 * 0.00055;
      const decay =
        (noise(Math.round(stripY + signalTime * 2), modelIndex + 71) - 0.5) *
        width *
        (0.014 + speed * 0.055 + agentic * 0.025);
      const shear =
        Math.sin(stripY * frequency + signalTime * (0.7 + speed)) * width * (0.006 + speed * 0.022);
      const alpha = 0.42 + intelligence * 0.36 + 0.16 * Math.sin(stripY * 0.017 + signalTime);
      const sourceY = Math.max(0, Math.round((stripY - layer.top) * density));
      const sourceHeight = Math.min(
        Math.round(stripHeight * density + 1),
        layer.canvas.height - sourceY,
      );
      if (sourceHeight <= 0) {
        continue;
      }

      context.save();
      context.globalAlpha = alpha;
      context.globalCompositeOperation = "screen";
      if (frame.pointer.energy > 0.01) {
        const chunkWidth = Math.round(68 - agentic * 30);
        for (let chunkX = 0; chunkX < width; chunkX += chunkWidth) {
          const chunk = Math.min(chunkWidth, width - chunkX);
          const displaced = disturb(
            frame,
            chunkX + chunk / 2,
            stripY + stripHeight / 2,
            0.055 + speed * 0.03,
          );
          context.drawImage(
            layer.canvas,
            Math.round(chunkX * density),
            sourceY,
            Math.round(chunk * density),
            sourceHeight,
            chunkX + decay + shear + displaced.x - (chunkX + chunk / 2),
            stripY + displaced.y - (stripY + stripHeight / 2),
            chunk,
            stripHeight,
          );
        }
      } else {
        context.drawImage(
          layer.canvas,
          0,
          sourceY,
          layer.canvas.width,
          sourceHeight,
          decay + shear,
          stripY,
          width,
          stripHeight,
        );
      }
      context.restore();
    }
  });

  context.save();
  context.font = `9px ${MATERIAL_MONO_FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let y = height * 0.12; y < height * 0.88; y += 28) {
    for (let x = width * 0.46; x < width * 0.98; x += 30) {
      const value = noise(Math.round(x + signalTime * 8), Math.round(y));
      if (value < 0.57) {
        continue;
      }
      const model = models[Math.floor(value * models.length * 4) % models.length];
      if (model == null) {
        continue;
      }
      const displaced = disturb(frame, x, y, 0.045);
      context.globalAlpha = (30 + value * 80) / 255;
      context.fillStyle = model.color;
      context.font = `${7 + value * 4}px ${MATERIAL_MONO_FONT}`;
      context.fillText(
        GLYPHS[Math.floor(value * GLYPHS.length) % GLYPHS.length] ?? "·",
        displaced.x,
        displaced.y,
      );
    }
  }
  context.restore();
}

function signalTypeLayers(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseSize: number,
  models: SignatureModel[],
): TypeLayer[] {
  const density = context.canvas.width / Math.max(1, width);
  const compact = width < 720;
  const keys = models.map((model, modelIndex) => {
    const fontSize = signalTypeFontSize(baseSize, model, models.length, width);
    return `${model.key}:${model.name}:${model.color}:${fontSize}:${width}:${height}:${density}:${modelIndex}`;
  });
  const existing = typeLayers.get(context);
  if (
    existing != null &&
    existing.length === keys.length &&
    existing.every((layer, index) => layer.modelKey === keys[index])
  ) {
    return existing;
  }

  const layers = models.map((model, modelIndex) => {
    const fontSize = signalTypeFontSize(baseSize, model, models.length, width);
    const y = signalTypeY(compact, modelIndex, models.length, height);
    const top = Math.max(0, y - fontSize * 0.68 - 2);
    const bottom = Math.min(height, y + fontSize * 0.52 + 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round((bottom - top) * density));
    const layerContext = canvas.getContext("2d");
    if (layerContext == null) {
      throw new Error("Unable to create the Signal Type rendering layer.");
    }
    layerContext.setTransform(density, 0, 0, density, 0, 0);
    layerContext.font = `620 ${fontSize}px ${MATERIAL_SANS_FONT}`;
    layerContext.textAlign = "right";
    layerContext.textBaseline = "middle";
    layerContext.fillStyle = withAlpha(model.color, 0.48 + model.parameters.intelligence * 0.45);
    layerContext.fillText(model.name.toUpperCase(), width * 0.95, y - top);
    return {
      canvas,
      modelKey: keys[modelIndex] ?? "",
      top,
    };
  });
  typeLayers.set(context, layers);
  return layers;
}

function signalTypeY(
  compact: boolean,
  modelIndex: number,
  modelCount: number,
  height: number,
): number {
  const start = compact ? 0.58 : 0.18;
  const end = compact ? 0.8 : 0.78;
  const progress = modelCount <= 1 ? 0.5 : modelIndex / (modelCount - 1);
  return height * (start + (end - start) * progress);
}

function signalTypeFontSize(
  baseSize: number,
  model: SignatureModel,
  modelCount: number,
  width: number,
): number {
  const populationScale = modelCount <= 3 ? 1 : width < 720 ? 0.66 : 0.8;
  const scoreSize = baseSize * (0.62 + model.parameters.context * 0.48) * populationScale;
  const availableWidth = width * 0.55;
  const estimatedTextWidth = Math.max(1, model.name.length) * 0.67;
  return Math.min(scoreSize, availableWidth / estimatedTextWidth);
}

function drawMaterialAnnotations(frame: MaterialFrame): void {
  const { context, width, models, palette } = frame;
  if (width < 720) {
    return;
  }

  context.save();
  context.textBaseline = "middle";
  context.lineJoin = "round";
  models.forEach((model, modelIndex) => {
    const anchor =
      frame.mode === "field"
        ? evidenceAnchor(modelIndex, frame.width, frame.height)
        : modelPoint(modelIndex, models.length, frame.width, frame.height);
    const displaced = disturb(frame, anchor.x, anchor.y, 0.04);
    const rank = String(model.rank).padStart(2, "0");
    const rankFont = `650 9px ${MATERIAL_MONO_FONT}`;
    const nameFont = `600 13px ${MATERIAL_SANS_FONT}`;
    context.font = rankFont;
    const rankWidth = context.measureText(rank).width;
    context.font = nameFont;
    const nameWidth = context.measureText(model.name).width;
    const labelWidth = rankWidth + 8 + nameWidth;
    const labelOnLeft = displaced.x + 18 + labelWidth > width - 20;
    const labelX = displaced.x + (labelOnLeft ? -18 - labelWidth : 18);
    if (frame.mode === "phase") {
      context.strokeStyle = withAlpha(model.color, 0.74);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(displaced.x - 18, displaced.y);
      context.lineTo(displaced.x + 18, displaced.y);
      context.moveTo(displaced.x, displaced.y - 18);
      context.lineTo(displaced.x, displaced.y + 18);
      context.stroke();
    } else {
      context.save();
      context.translate(displaced.x, displaced.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = model.color;
      const markerSize = 5;
      context.fillRect(-markerSize, -markerSize, markerSize * 2, markerSize * 2);
      context.restore();
    }
    context.textAlign = "left";
    context.lineWidth = 2;
    context.strokeStyle = withAlpha(palette.background, 0.82);
    context.font = rankFont;
    context.strokeText(rank, labelX, displaced.y);
    context.fillStyle = withAlpha(palette.muted, 0.82);
    context.fillText(rank, labelX, displaced.y);
    context.font = nameFont;
    context.strokeText(model.name, labelX + rankWidth + 8, displaced.y);
    context.fillStyle = withAlpha(palette.ink, 0.92);
    context.fillText(model.name, labelX + rankWidth + 8, displaced.y);
  });
  context.restore();
}

function evidenceAnchor(index: number, width: number, height: number): Point {
  const desktopClusters = [
    [0.88, 0.16],
    [0.72, 0.34],
    [0.92, 0.49],
    [0.66, 0.66],
    [0.8, 0.82],
  ];
  const compactClusters = [
    [0.85, 0.34],
    [0.68, 0.46],
    [0.6, 0.59],
    [0.88, 0.7],
    [0.71, 0.83],
  ];
  const clusters = width < 720 ? compactClusters : desktopClusters;
  const cluster = clusters[index] ?? clusters[index % clusters.length] ?? [0.68, 0.48];
  return {
    x: Number(cluster[0]) * width,
    y: Number(cluster[1]) * height,
  };
}

function renderEmptyField(frame: MaterialFrame): void {
  const { context, width, height, time, palette } = frame;
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.save();
  context.strokeStyle = withAlpha(palette.muted, 0.15);
  context.lineWidth = 0.8;
  for (let lineIndex = 0; lineIndex < 18; lineIndex += 1) {
    const y = height * (0.18 + lineIndex / 24);
    context.beginPath();
    for (let x = width * 0.38; x < width; x += 14) {
      const wave = Math.sin(x * 0.012 + time + lineIndex) * 5;
      const displaced = disturb(frame, x, y + wave, 0.032);
      if (x === width * 0.38) {
        context.moveTo(displaced.x, displaced.y);
      } else {
        context.lineTo(displaced.x, displaced.y);
      }
    }
    context.stroke();
  }
  context.restore();
}

function disturb(frame: MaterialFrame, x: number, y: number, response: number): Point {
  const { pointer, width, height } = frame;
  if (pointer.energy < 0.002) {
    return { x, y };
  }
  const radius = Math.min(width, height) * POINTER_RADIUS_RATIO;
  const dx = x - pointer.x;
  const dy = y - pointer.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared > radius * radius * 4) {
    return { x, y };
  }
  const distance = Math.sqrt(distanceSquared);
  const normalized = distance / Math.max(1, radius);
  const influence = Math.exp(-normalized * normalized * 2.55) * pointer.energy;
  const wave = Math.sin(normalized * Math.PI * 6.2 - pointer.phase);
  const inverseDistance = 1 / Math.max(1, distance);
  const radialX = dx * inverseDistance;
  const radialY = dy * inverseDistance;
  const tangentX = -radialY;
  const tangentY = radialX;
  const scale = Math.min(width, height) * response;
  return {
    x: x + radialX * wave * influence * scale + tangentX * pointer.vx * influence * 0.82,
    y: y + radialY * wave * influence * scale + tangentY * pointer.vy * influence * 0.82,
  };
}

function modelPoint(index: number, count: number, width: number, height: number): Point {
  const desktop = [
    [0.84, 0.23],
    [0.69, 0.35],
    [0.88, 0.48],
    [0.61, 0.63],
    [0.72, 0.77],
  ];
  const compact = [
    [0.82, 0.38],
    [0.65, 0.49],
    [0.58, 0.66],
    [0.84, 0.74],
    [0.68, 0.84],
  ];
  const points = width < 720 ? compact : desktop;
  const fallbackX = 0.58 + ((index + 1) / Math.max(2, count + 1)) * 0.36;
  const fallbackY = 0.2 + ((index + 1) / Math.max(2, count + 1)) * 0.65;
  const point = points[index] ?? [fallbackX, fallbackY];
  return { x: Number(point[0]) * width, y: Number(point[1]) * height };
}

function noise(x: number, y: number): number {
  return fractional(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
}

function pseudoGaussian(index: number, modelIndex: number): number {
  return (
    (noise(index, modelIndex) +
      noise(index + 19, modelIndex + 3) +
      noise(index + 47, modelIndex + 7)) /
      3 -
    0.5
  );
}

function fractional(value: number): number {
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function colorChannels(color: string): [number, number, number] {
  const hex = color.trim().replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const value = Number.parseInt(hex, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const match = color.match(/\d+(?:\.\d+)?/g);
  if (match && match.length >= 3) {
    return [Number(match[0]), Number(match[1]), Number(match[2])];
  }
  return [216, 255, 69];
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isDarkColor(color: string): boolean {
  const [red, green, blue] = colorChannels(color);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128;
}

function withAlpha(color: string, alpha: number): string {
  const [red, green, blue] = colorChannels(color);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}
