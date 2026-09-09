/** Phase Ledger canvas renderer with WebGL and CPU paths, model annotations and pointer response. */

import type { SignatureModel } from "./models";
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
  models: SignatureModel[];
  pointer: MaterialPointer;
  palette: MaterialPalette;
};

type Point = {
  x: number;
  y: number;
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
const MATERIAL_MONO_FONT = '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace';
const MATERIAL_SANS_FONT = '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif';
const POINTER_RADIUS_RATIO = 0.14;
const PROVIDER_BLEND_EXPONENT = 0.78;
const phaseBuffers = new WeakMap<CanvasRenderingContext2D, PhaseBuffer>();

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
  renderPhaseLedger(frame);
}

function renderPhaseLedger(frame: MaterialFrame): void {
  drawPhaseSurface(frame);
  drawMaterialAnnotations(frame);
}

/** Render the Phase Ledger through WebGL when available, falling back to a cached CPU field that preserves the same material inputs. */
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

function drawMaterialAnnotations(frame: MaterialFrame): void {
  const { context, width, models, palette } = frame;
  const compact = width < 720;

  context.save();
  context.textBaseline = "middle";
  context.lineJoin = "round";
  models.forEach((model, modelIndex) => {
    const anchor = modelPoint(modelIndex, models.length, frame.width, frame.height);
    const displaced = disturb(frame, anchor.x, anchor.y, 0.04);
    const annotationY = compact ? Math.min(displaced.y, frame.height * 0.76) : displaced.y;
    const annotationX =
      compact && annotationY > frame.height * 0.7
        ? Math.min(displaced.x, width * 0.62)
        : displaced.x;
    const rank = String(model.rank).padStart(2, "0");
    const rankFont = `650 9px ${MATERIAL_MONO_FONT}`;
    const nameFont = `${model.preview ? "italic " : ""}600 13px ${MATERIAL_SANS_FONT}`;
    context.font = rankFont;
    const rankWidth = context.measureText(rank).width;
    context.font = nameFont;
    const nameWidth = context.measureText(model.name).width;
    const labelWidth = rankWidth + 8 + nameWidth;
    const labelOnLeft = annotationX + 18 + labelWidth > width - 20;
    const labelX = annotationX + (labelOnLeft ? -18 - labelWidth : 18);

    context.strokeStyle = withAlpha(model.color, 0.74);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(annotationX - 18, annotationY);
    context.lineTo(annotationX + 18, annotationY);
    context.moveTo(annotationX, annotationY - 18);
    context.lineTo(annotationX, annotationY + 18);
    context.stroke();
    context.textAlign = "left";
    context.lineWidth = 2;
    context.strokeStyle = withAlpha(palette.background, 0.82);
    context.font = rankFont;
    context.strokeText(rank, labelX, annotationY);
    context.fillStyle = withAlpha(palette.muted, 0.82);
    context.fillText(rank, labelX, annotationY);
    context.font = nameFont;
    context.strokeText(model.name, labelX + rankWidth + 8, annotationY);
    context.fillStyle = withAlpha(palette.ink, 0.92);
    context.fillText(model.name, labelX + rankWidth + 8, annotationY);
  });
  context.restore();
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

function disturb(
  frame: MaterialFrame,
  x: number,
  y: number,
  response: number,
  target: Point = { x: 0, y: 0 },
): Point {
  const { pointer, width, height } = frame;
  if (pointer.energy < 0.002) {
    target.x = x;
    target.y = y;
    return target;
  }
  const radius = Math.min(width, height) * POINTER_RADIUS_RATIO;
  const dx = x - pointer.x;
  const dy = y - pointer.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared > radius * radius * 4) {
    target.x = x;
    target.y = y;
    return target;
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
  target.x = x + radialX * wave * influence * scale + tangentX * pointer.vx * influence * 0.82;
  target.y = y + radialY * wave * influence * scale + tangentY * pointer.vy * influence * 0.82;
  return target;
}

function modelPoint(index: number, count: number, width: number, height: number): Point {
  const desktop = [
    [0.84, 0.23],
    [0.69, 0.35],
    [0.88, 0.48],
    [0.61, 0.63],
    [0.72, 0.77],
    [0.91, 0.68],
  ];
  const fallbackX = 0.58 + ((index + 1) / Math.max(2, count + 1)) * 0.36;
  const fallbackY = 0.2 + ((index + 1) / Math.max(2, count + 1)) * 0.65;
  const point = desktop[index] ?? [fallbackX, fallbackY];
  return { x: Number(point[0]) * width, y: Number(point[1]) * height };
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
