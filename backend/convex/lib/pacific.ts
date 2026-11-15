const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function pacificDate(ms: number = Date.now()): string {
  return dateFormatter.format(new Date(ms));
}

export function dayIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
}

export function dateFromDayIndex(index: number): string {
  return new Date(index * 86400000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return dateFromDayIndex(dayIndex(date) + days);
}
