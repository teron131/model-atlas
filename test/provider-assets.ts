import assert from "node:assert/strict";

import { providerAssets } from "../app/dashboard/shared/providerAssets.generated";
import {
	providerAssetLogo,
	providerDisplayColor,
} from "../app/dashboard/shared/providerTheme";

const openaiLogo = providerAssetLogo("openai");
const openaiSvg = svgText(openaiLogo);

assert.equal(
	openaiLogo.startsWith("data:image/svg+xml;base64,"),
	true,
	"provider logos should be generated as source-managed SVG data URLs",
);
assert.equal(
	providerDisplayColor("openai"),
	"var(--provider-openai-color)",
	"fixed provider colors should remain stable over generated colors",
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
