const APP_DATE_LOCALE = "en-GB";
const APP_DATE_TIME_ZONE = "Europe/London";

const dateTimeFormatter = new Intl.DateTimeFormat(APP_DATE_LOCALE, {
  timeZone: APP_DATE_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(APP_DATE_LOCALE, {
  timeZone: APP_DATE_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
});

function coerceDate(value: string | number | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | number | Date | null | undefined) {
  const date = coerceDate(value);
  return date ? dateTimeFormatter.format(date) : "";
}

export function formatDate(value: string | number | Date | null | undefined) {
  const date = coerceDate(value);
  return date ? dateFormatter.format(date) : "";
}

export const DISPLAY_TIMEZONE_LABEL = "UK time";
