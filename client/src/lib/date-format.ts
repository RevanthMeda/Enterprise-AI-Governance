const APP_DATE_TIME_ZONE = "Europe/London";
const formatterCache = new Map<string, { dateTime: Intl.DateTimeFormat; date: Intl.DateTimeFormat }>();

function resolveAppLocale() {
  if (typeof document !== "undefined" && document.documentElement.lang) {
    return document.documentElement.lang;
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }

  return "en-GB";
}

function getFormatters() {
  const locale = resolveAppLocale();
  const cached = formatterCache.get(locale);
  if (cached) {
    return cached;
  }

  const formatters = {
    dateTime: new Intl.DateTimeFormat(locale, {
      timeZone: APP_DATE_TIME_ZONE,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    date: new Intl.DateTimeFormat(locale, {
      timeZone: APP_DATE_TIME_ZONE,
      year: "numeric",
      month: "short",
      day: "2-digit",
    }),
  };
  formatterCache.set(locale, formatters);
  return formatters;
}

function coerceDate(value: string | number | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | number | Date | null | undefined) {
  const date = coerceDate(value);
  return date ? getFormatters().dateTime.format(date) : "";
}

export function formatDate(value: string | number | Date | null | undefined) {
  const date = coerceDate(value);
  return date ? getFormatters().date.format(date) : "";
}

export const DISPLAY_TIMEZONE_LABEL = "UK time";
