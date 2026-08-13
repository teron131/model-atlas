/** Verify generated provider assets and browser-facing icon metadata. */

import assert from "node:assert/strict";

import { providerAssets } from "../app/dashboard/shared/provider-assets.generated";
import { providerIcons } from "../app/dashboard/shared/provider-icons.generated";
import { providerBrandColor, providerLogo } from "../app/dashboard/shared/provider-theme";

const openaiLogo = providerLogo("openai");
const metaLogo = providerLogo("meta");

assert.deepEqual(
  Object.keys(providerIcons),
  Object.keys(providerAssets),
  "browser-facing icon metadata should cover every generated provider asset",
);
assert.equal(
  openaiLogo,
  providerIcons.openai.logo,
  "provider lookup should keep generated OpenAI bytes in a static browser asset",
);
assert.equal(
  providerBrandColor("openai"),
  "var(--provider-openai-color)",
  "provider color overrides should remain stable over generated colors",
);
assert.equal(
  metaLogo,
  providerIcons.meta.logo,
  "provider lookup should return one cacheable static URL per generated provider",
);
assert.equal(
  Object.values(providerIcons).every(
    (icon) => icon.logo.startsWith("/provider-icons/") && /^#[0-9a-f]{6}$/i.test(icon.color),
  ),
  true,
  "all browser-facing provider metadata should expose static paths and hex colors",
);
assert.equal(
  Object.values(providerAssets).every((asset) =>
    asset.logo.startsWith("data:image/svg+xml;base64,"),
  ),
  true,
  "all generated provider logos should use SVG data URLs",
);
assert.equal(
  Object.values(providerAssets).every((asset) => /^#[0-9a-f]{6}$/i.test(asset.color)),
  true,
  "all generated provider colors should be hex colors",
);
