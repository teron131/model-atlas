/** Release labels distinguish evaluated snapshots from generic model launch metadata for both current and retained identities. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DATE_LABEL =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)['’]?\s+['’]?(\d{4}|\d{2})\b/i;

/** Read an explicit year-bearing snapshot date; shortened version suffixes do not establish a year by themselves. */
export function versionDate(version: string): string | null {
  const match = /(?:^|-)(20\d{2})-?(\d{2})-?(\d{2})(?:$|[-_])/.exec(version);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null;
}

/** Read a named release month without treating an undated model's launch metadata as a snapshot identifier. */
export function releaseLabelPeriod(name: string): string | null {
  const match = DATE_LABEL.exec(name);
  if (!match) return null;
  const month =
    MONTHS.findIndex((m) => m.toLowerCase() === match[1]!.slice(0, 3).toLowerCase()) + 1;
  const year = match[2]!.length === 2 ? `20${match[2]}` : match[2]!;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function sameRelease(period: string, date: string): boolean {
  if (period.length === 7 || date.length === 7) return period.slice(0, 7) === date.slice(0, 7);
  // Sources sometimes report the adjacent calendar date for one launch; months and versions still remain distinct.
  return Math.abs(Date.parse(period) - Date.parse(date)) <= 86_400_000;
}

export function normalizedDateLabel(name: string): string {
  return name.replace(DATE_LABEL, (_text, month: string, year: string) => {
    const short = MONTHS.find((m) => m.toLowerCase() === month.slice(0, 3).toLowerCase())!;
    return `${short} ${year.length === 2 ? `20${year}` : year}`;
  });
}
