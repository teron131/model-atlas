/** Materialize provider logo modules and public SVGs for every provider in the current snapshot (the published one, or the local checkpoint with MODEL_ATLAS_LOCAL_DATABASE=1): display models bring their logos, labs only the Timeline knows take their models.dev logo, and remote logos go through the logo cache. */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

import {
  readDisplayPayload,
  readTimelineDataset,
} from "../src/model-atlas/database/runtime-snapshot";
import { providerIdentityKey } from "../src/model-atlas/identity/provider";
import { cacheModelLogos, resizeLogoToPng } from "../src/model-atlas/logos/cache";
import { providerIconColor } from "../src/model-atlas/logos/color";
import { modelsDevLogoUrl, providerAssetKey } from "../src/model-atlas/logos/resolve";

type ProviderAsset = {
  logo: string;
  color: string;
};

type ProviderAssetMap = Record<string, ProviderAsset>;

const GENERATED_PATH = "src/model-atlas/logos/provider-assets.generated.ts";
const GENERATED_ICON_PATH = "src/model-atlas/logos/provider-icons.generated.ts";
const PUBLIC_ICON_DIR = "public/provider-icons";
const LOGO_SIZE = 64;

const force = process.argv.includes("--force");

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const existingAssets = force ? {} : await readExistingAssets();
const logoSources = await readLogoSources(Object.keys(existingAssets));
const nextAssets: ProviderAssetMap = { ...existingAssets };

for (const [provider, source] of [...logoSources].sort()) {
  if (nextAssets[provider] != null) {
    continue;
  }
  const logoBuffer = await readLogoBuffer(provider, source);
  if (logoBuffer == null) {
    continue;
  }
  const logoPng = await resizeLogoToPng(logoBuffer);
  const color = (await providerIconColor(logoPng)) ?? "#eeeeea";
  nextAssets[provider] = {
    logo: svgDataUrl(logoPng),
    color,
  };
}

await mkdir(resolve(PUBLIC_ICON_DIR), { recursive: true });
await Promise.all([
  writeFile(resolve(GENERATED_PATH), renderProviderModule(nextAssets, "assets")),
  writeFile(resolve(GENERATED_ICON_PATH), renderProviderModule(nextAssets, "icons")),
  ...Object.entries(nextAssets).map(([provider, asset]) =>
    writeFile(resolve(PUBLIC_ICON_DIR, `${provider}.svg`), generatedIconBytes(asset.logo)),
  ),
]);

console.log(
  JSON.stringify(
    {
      path: GENERATED_PATH,
      providers: Object.keys(nextAssets).length,
      added: Object.keys(nextAssets).length - Object.keys(existingAssets).length,
      force,
    },
    null,
    2,
  ),
);

async function readExistingAssets(): Promise<ProviderAssetMap> {
  try {
    const moduleUrl = pathToFileURL(resolve(GENERATED_PATH)).href;
    const module = (await import(moduleUrl)) as {
      providerAssets?: ProviderAssetMap;
    };
    return module.providerAssets ?? {};
  } catch {
    return {};
  }
}

/** One logo per provider, preferring a logo the snapshot already embeds over a remote link, which may have gone dead; a Timeline lab is added only when no spelling of it has a logo yet, since its models.dev logo would otherwise outrank that one wherever icons resolve by identity. */
async function readLogoSources(generated: readonly string[]) {
  const sources = new Map<string, string>();
  const rank = (logo: string) => (logo.startsWith("data:image/") ? 2 : logo ? 1 : 0);
  for (const model of (await readDisplayPayload()).models) {
    const provider = providerAssetKey(model.provider);
    if (provider.length === 0) {
      continue;
    }
    const logo = typeof model.logo === "string" ? model.logo : "";
    if (!sources.has(provider) || rank(logo) > rank(sources.get(provider)!)) {
      sources.set(provider, logo);
    }
  }
  const covered = new Set([...generated, ...sources.keys()].map(providerIdentityKey));
  // The Timeline names a lab by its identity key; the archive's own spelling can be another company's models.dev id (`liquid`).
  for (const model of (await readTimelineDataset())?.models ?? []) {
    const provider = providerIdentityKey(model.provider);
    const logo = modelsDevLogoUrl(provider);
    if (logo != null && !covered.has(provider)) {
      sources.set(provider, logo);
      covered.add(provider);
    }
  }
  return sources;
}

/** `null` when neither the source nor the provider's models.dev logo can be fetched; models.dev's placeholder for providers it does not list counts as no logo. */
async function readLogoBuffer(provider: string, source: string) {
  const [cached] = await cacheModelLogos([{ logo: source, provider }], () => provider);
  return cached?.logo ? decodeDataUrl(cached.logo) : null;
}

/** The payload after `;base64,` decodes as base64, otherwise the text after the first comma is percent-decoded: `data:image/svg+xml,%3Csvg%2F%3E` → `<svg/>`. */
function decodeDataUrl(source: string) {
  const base64Marker = ";base64,";
  const base64Index = source.indexOf(base64Marker);
  if (base64Index >= 0) {
    return Buffer.from(source.slice(base64Index + base64Marker.length), "base64");
  }
  const commaIndex = source.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }
  return Buffer.from(decodeURIComponent(source.slice(commaIndex + 1)), "utf8");
}

/** Reject malformed generated assets instead of emitting empty public icon files. */
function generatedIconBytes(source: string) {
  const bytes = decodeDataUrl(source);
  if (bytes == null) {
    throw new Error("Generated provider icon is not a valid data URL");
  }
  return bytes;
}

function svgDataUrl(imageBuffer: Buffer) {
  const imageHref = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_SIZE}" height="${LOGO_SIZE}" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}">`,
    `<image href="${imageHref}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"/>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Render both generated contracts with identical provider ordering, escaping, and field layout. */
function renderProviderModule(assets: ProviderAssetMap, kind: "assets" | "icons") {
  const embedded = kind === "assets";
  const typeName = embedded ? "ProviderAsset" : "ProviderIcon";
  const exportName = embedded ? "providerAssets" : "providerIcons";
  const entries = Object.entries(assets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, asset]) => {
      const key = /^[A-Za-z_$][\w$]*$/.test(provider) ? provider : JSON.stringify(provider);
      const logo = embedded ? asset.logo : `/provider-icons/${provider}.svg`;
      return [
        `\t${key}: {`,
        `\t\tcolor: ${JSON.stringify(asset.color)},`,
        `\t\tlogo: ${JSON.stringify(logo)},`,
        "\t},",
      ].join("\n");
    })
    .join("\n");
  return [
    embedded
      ? "// Generated provider logo data for API and dashboard consumers; do not edit directly."
      : "// Generated provider icon URLs and colors for dashboard consumers; do not edit directly.",
    "",
    `type ${typeName} = {`,
    "\tcolor: string;",
    "\tlogo: string;",
    "};",
    "",
    `export const ${exportName} = {`,
    entries,
    `} as const satisfies Record<string, ${typeName}>;`,
    "",
  ].join("\n");
}
