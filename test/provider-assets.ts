/** Verify generated provider assets and browser-facing icon metadata. */

import assert from "node:assert/strict";

import { providerAssets } from "../app/dashboard/shared/provider-assets.generated";
import { providerIcons } from "../app/dashboard/shared/provider-icons.generated";
import {
	providerBrandColor,
	providerLogo,
} from "../app/dashboard/shared/provider-theme";

const openaiLogo = providerLogo("openai");
const openaiSvg = svgText(providerAssets.openai.logo);
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
assert.match(
	openaiSvg,
	/<svg[^>]+width="64"[^>]+height="64"[^>]+viewBox="0 0 64 64"/,
	"generated provider SVGs should use the normalized target size",
);
assert.match(
	openaiSvg,
	/<image href="data:image\/png;base64,[^"]+" width="64" height="64"\/>/,
	"generated provider SVGs should wrap normalized PNG bytes",
);
assert.equal(
	metaLogo,
	providerIcons.meta.logo,
	"provider lookup should return one cacheable static URL per generated provider",
);
assert.equal(
	Object.values(providerIcons).every(
		(icon) =>
			icon.logo.startsWith("/provider-icons/") &&
			/^#[0-9a-f]{6}$/i.test(icon.color),
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
	Object.values(providerAssets).every((asset) =>
		/^#[0-9a-f]{6}$/i.test(asset.color),
	),
	true,
	"all generated provider colors should be hex colors",
);

function svgText(dataUrl: string) {
	return Buffer.from(
		dataUrl.slice("data:image/svg+xml;base64,".length),
		"base64",
	).toString("utf8");
}
