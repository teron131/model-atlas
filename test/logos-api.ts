import assert from "node:assert/strict";

import { GET as getLogo } from "../app/api/logos/[logo]/route";
import { GET as getLogos } from "../app/api/logos/route";

const allResponse = await getLogos();
assert.equal(allResponse.status, 200);

const allPayload = await allResponse.json();
assert.equal(
	typeof allPayload.openai,
	"string",
	"logo API should include generated provider logos",
);
assert.equal(
	allPayload.openai.startsWith("data:image/svg+xml;base64,"),
	true,
	"logo API should include generated provider logos",
);
assert.equal(
	allPayload.meta.startsWith("data:image/svg+xml;base64,"),
	true,
	"logo API should expose the generated Meta logo",
);

const openaiResponse = await getLogo(
	new Request("https://example.com/api/logos/openai"),
	{
		params: Promise.resolve({ logo: "openai" }),
	},
);
assert.equal(openaiResponse.status, 200);

const openaiPayload = await openaiResponse.json();
assert.deepEqual(Object.keys(openaiPayload), ["openai"]);
assert.equal(
	openaiPayload.openai.startsWith("data:image/svg+xml;base64,"),
	true,
);
assert.match(
	Buffer.from(
		openaiPayload.openai.slice("data:image/svg+xml;base64,".length),
		"base64",
	).toString("utf8"),
	/<svg[^>]+width="64"[^>]+height="64"[^>]+viewBox="0 0 64 64"/,
);

const missingResponse = await getLogo(
	new Request("https://example.com/api/logos/nope"),
	{
		params: Promise.resolve({ logo: "nope" }),
	},
);
assert.equal(missingResponse.status, 404);
