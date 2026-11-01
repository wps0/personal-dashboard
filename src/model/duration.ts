/**
 * A length of time as typed, in hours (whole minutes): "1h 53m", "1h53m",
 * "2h", "45m", "1:53", "1.5" or "1,5" (hours). Null if it isn't one.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  let min: number;
  const colon = /^(\d+):(\d{2})$/.exec(t);
  const hm = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/.exec(t);
  if (colon) {
    if (Number(colon[2]) > 59) return null;
    min = Number(colon[1]) * 60 + Number(colon[2]);
  } else if (/^\d+(?:\.\d+)?$/.test(t)) {
    min = Number(t) * 60;
  } else if (hm && (hm[1] || hm[2])) {
    min = Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0);
  } else {
    return null;
  }
  return Math.round(min) / 60;
}
