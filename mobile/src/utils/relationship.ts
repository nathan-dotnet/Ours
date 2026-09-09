import { fromLocalDateString } from './date';

/**
 * "Days together" for the Home screen's milestone number. Counts inclusively — the anniversary
 * date itself is day 1, not day 0 — which is how every "we've been together for N days" counter
 * reads in practice. Parses the couple's `anniversary_date` ("YYYY-MM-DD") as a *local* midnight
 * via fromLocalDateString, same as the calendar/month-grid math elsewhere in this app, so the
 * count never silently shifts by one depending on the device's timezone.
 *
 * Returns null (never a fake number) when there's no anniversary date set yet, or when it's set
 * in the future — the Home screen is responsible for rendering that gracefully, not this.
 */
export function daysTogether(anniversaryDate: string | null | undefined, today: Date): number | null {
  if (!anniversaryDate) return null;

  const start = fromLocalDateString(anniversaryDate);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - start.getTime()) / 86_400_000);

  return diffDays >= 0 ? diffDays + 1 : null;
}
