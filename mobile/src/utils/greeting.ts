/** A quiet, time-based greeting for the Home screen — no "good night"/emoji-laden variants, just the three plain ones the spec asks for. */
export function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
