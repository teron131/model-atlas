/** Blended token price: one USD-per-million figure per model for agent workloads, mixing cache-read, new-input, and output prices at the two ends of the session-length range. */

/** USD per million tokens of each kind of token an agent request is billed for. */
export type BlendPrices = { cache_read: number; new_input: number; output: number };

/**
 * Token shares of new input and output at the two ends of the agent workloads the blend spans; every other token is a cache read.
 * Long sessions re-read more context per new token than short tasks, so they sit at the low end of both shares.
 */
const BLEND_MIXES = {
  long_sessions: { new_input: 0.025, output: 0.003 },
  short_tasks: { new_input: 0.05, output: 0.015 },
} as const;

/**
 * Resolve one listed price card into blend prices.
 * New input pays the cache-write price where one is listed, since providers that bill writes bill every new token as one; an unlisted cache read costs a tenth of input, the median listed ratio.
 */
export function listedBlendPrices(card: {
  input?: number | null;
  output?: number | null;
  cache_read?: number | null;
  cache_write?: number | null;
}): BlendPrices | null {
  const { input, output } = card;
  if (input == null || input < 0 || output == null || output < 0) return null;
  return {
    cache_read: card.cache_read ?? input / 10,
    new_input: card.cache_write ?? input,
    output,
  };
}

/** Blend at both ends of the workload range; the blended price is their midpoint, the blend at the middle mix. */
export function blendedPrices(prices: BlendPrices): {
  long_sessions: number;
  short_tasks: number;
  middle: number;
} {
  const longSessions = blendAt(prices, BLEND_MIXES.long_sessions);
  const shortTasks = blendAt(prices, BLEND_MIXES.short_tasks);
  return {
    long_sessions: longSessions,
    short_tasks: shortTasks,
    middle: (longSessions + shortTasks) / 2,
  };
}

function blendAt(prices: BlendPrices, mix: { new_input: number; output: number }): number {
  return (
    (1 - mix.new_input - mix.output) * prices.cache_read +
    mix.new_input * prices.new_input +
    mix.output * prices.output
  );
}

// Below every listed price, so only free models reach it; absolute price clips its favorable tail above this floor anyway.
const MINIMUM_LOG_BLENDED_PRICE = 0.001;

/** Log blended price so equal price ratios count equally at every price level; free models stay finite and cheapest. */
export function logBlendedPrice(price: number | null): number | null {
  return price == null ? null : Math.log(Math.max(price, MINIMUM_LOG_BLENDED_PRICE));
}
