/** Release labels distinguish evaluated snapshots from generic model launch metadata for both current and retained identities. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_YEAR_LABEL =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)['’]?\s+['’]?(\d{4}|\d{2})\b/i;

/**
 * Read an explicit year-bearing snapshot date; shortened version suffixes do not establish a year by themselves.
 * `"claude-sonnet-4-5-20250929"` → `"2025-09-29"`, but `"deepseek-r1-0528"` → `null`.
 */
export function versionDate(version: string): string | null {
  const match = /(?:^|-)(20\d{2})-?(\d{2})-?(\d{2})(?:$|[-_])/.exec(version);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null;
}

/** Read a named release month without treating an undated model's launch metadata as a snapshot identifier: `"Gemini 2.5 Pro (Jun '25)"` → `"2025-06"`. */
export function releaseLabelPeriod(name: string): string | null {
  const match = MONTH_YEAR_LABEL.exec(name);
  if (!match) return null;
  const month =
    MONTHS.findIndex((m) => m.toLowerCase() === match[1]!.slice(0, 3).toLowerCase()) + 1;
  const year = match[2]!.length === 2 ? `20${match[2]}` : match[2]!;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isSameRelease(period: string, date: string): boolean {
  if (period.length === 7 || date.length === 7) return period.slice(0, 7) === date.slice(0, 7);
  // Sources sometimes report the adjacent calendar date for one launch; months and versions still remain distinct.
  return Math.abs(Date.parse(period) - Date.parse(date)) <= 86_400_000;
}

/** `"Gemini 2.5 Pro (June '25)"` → `"Gemini 2.5 Pro (Jun 2025)"`. */
export function normalizeDateLabel(name: string): string {
  return name.replace(MONTH_YEAR_LABEL, (_text, month: string, year: string) => {
    const short = MONTHS.find((m) => m.toLowerCase() === month.slice(0, 3).toLowerCase())!;
    return `${short} ${year.length === 2 ? `20${year}` : year}`;
  });
}
