/** Muse identity rules reconcile Wonder's 1.0 label in normalized tokens while preserving other versions and product tiers. */

/** Drops a trailing `-1-0` from Wonder's slug only: `"muse/muse-wonder-1-0"` → `"muse/muse-wonder"`. */
export function canonicalMuseToken(token: string): string {
  return token.replace(/(^|\/)muse-wonder-1-0$/, "$1muse-wonder");
}
