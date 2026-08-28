/** Executable route and resolver checks for provider logo lookup, filtering, and missing assets. */

import assert from "node:assert/strict";

import { GET as getLogo } from "../app/api/logos/[logo]/route";
import { GET as getLogos } from "../app/api/logos/route";
import { resolveModelLogo } from "../src/model-atlas/logos/resolve";

assert.equal(
  resolveModelLogo({ provider: "thinkingmachines" }),
  "https://artificialanalysis.ai/img/logos/thinking_machines.svg",
  "Thinking Machines should use the provider asset published by Artificial Analysis",
);

const allResponse = await getLogos();
assert.equal(allResponse.status, 200);

const allPayload = await allResponse.json();
assert.equal(typeof allPayload.openai, "string", "logo API should include the OpenAI provider");
assert.equal(typeof allPayload.meta, "string", "logo API should include Meta");

const openaiResponse = await getLogo(new Request("https://example.com/api/logos/openai"), {
  params: Promise.resolve({ logo: "openai" }),
});
assert.equal(openaiResponse.status, 200);

const openaiPayload = await openaiResponse.json();
assert.deepEqual(Object.keys(openaiPayload), ["openai"]);
assert.equal(openaiPayload.openai, allPayload.openai);

const missingResponse = await getLogo(new Request("https://example.com/api/logos/nope"), {
  params: Promise.resolve({ logo: "nope" }),
});
assert.equal(missingResponse.status, 404);
