import i18n from "i18next";

const lng = () => i18n.language || "en";

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(lng(), opts).format(n);
}

export function formatCompact(n: number) {
  return formatNumber(n, { notation: "compact", maximumFractionDigits: 1 });
}


export function formatSizeKb(kb: number) {
  const units = ["kilobyte", "megabyte", "gigabyte"] as const;
  let v = kb;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return formatNumber(v, { style: "unit", unit: units[i], unitDisplay: "short", maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 });
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lng(), opts).format(new Date(iso));
}

const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

export function formatRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  let duration = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lng(), { numeric: "auto", style: "short" });
  for (const [amount, unit] of DIVISIONS) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit);
    duration /= amount;
  }
  return "—";
}
