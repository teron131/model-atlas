/** Muse identity rules reconcile Wonder's 1.0 label in normalized tokens while preserving other versions and product tiers. */

export function canonicalMuseToken(token: string): string {
  return token.replace(/(^|\/)muse-wonder-1-0$/, "$1muse-wonder");
}
