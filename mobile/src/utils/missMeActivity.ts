import type { MissMeInteractionDto } from '../types/api';

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * "Little Moments" copy, phrased from the viewer's own side (never a raw activity-log line) —
 * "Nathaniel missed you" when the other person sent it, "You missed Nathaniel too" when the
 * viewer did. `partnerName` is needed for the viewer's-own-sends case since the DTO only ever
 * carries the sender's name, not the receiver's.
 */
export function describeMissMeMoment(item: MissMeInteractionDto, viewerUserId: string, partnerName: string): string {
  const isMine = item.senderUserId === viewerUserId;
  if (item.type === 'MissMe') {
    return isMine ? `You missed ${partnerName}` : `${item.senderDisplayName} missed you`;
  }
  return isMine ? `You missed ${partnerName} too` : `${item.senderDisplayName} missed you too`;
}

/** "Today · 8:42 PM" for today, otherwise a short date + time — mirrors the calendar's own day-label conventions. */
export function formatMomentTimestamp(createdAt: string, now: Date): string {
  const date = new Date(createdAt);
  const time = timeFormatter.format(date);
  if (isSameLocalDay(date, now)) {
    return `Today · ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
}
