const TIME_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*(?:([+-]\d{2})(\d{2}))?/;

/** Parses an XMLTV timestamp ("20260708120000 +0000") to a UTC epoch ms
 * value, or null if it doesn't match the expected shape. */
export function parseXmltvTime(raw: string): number | null {
  const m = TIME_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tzh, tzm] = m;
  const utcMillis = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (!tzh || !tzm) return utcMillis;
  const sign = tzh.trim().startsWith('-') ? -1 : 1;
  const offsetMinutes = Math.abs(Number(tzh)) * 60 * sign + Number(tzm) * sign;
  return utcMillis - offsetMinutes * 60_000;
}
