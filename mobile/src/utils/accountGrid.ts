/**
 * Pure layout logic for the Money dashboard's account grid — kept separate from the component so
 * it's unit-testable without rendering. The grid is 2 columns; the collapsed preview shows 2 full
 * rows (4 accounts) before offering "See All Accounts" — never a hardcoded 2-account cap on the
 * underlying data, just how many are shown before the user asks to see the rest.
 */

export const ACCOUNT_GRID_COLUMNS = 2;
export const ACCOUNT_GRID_PREVIEW_ROWS = 2;
export const ACCOUNT_GRID_PREVIEW_COUNT = ACCOUNT_GRID_COLUMNS * ACCOUNT_GRID_PREVIEW_ROWS;

export interface AccountGridView<T> {
  /** The accounts to actually render right now. */
  visible: T[];
  /** True when there are more accounts than the collapsed preview shows — this is what "See All Accounts" should be conditioned on, never shown for 1-2 accounts. */
  hasMore: boolean;
}

/** `expanded` is caller-owned UI state (see money.tsx); this function just decides what to show for a given state. */
export function getAccountGridView<T>(accounts: T[], expanded: boolean, previewCount: number = ACCOUNT_GRID_PREVIEW_COUNT): AccountGridView<T> {
  const hasMore = accounts.length > previewCount;
  return { visible: expanded || !hasMore ? accounts : accounts.slice(0, previewCount), hasMore };
}

/**
 * Splits accounts into fixed-size rows (2 items each, by default) for a strict N-column grid —
 * explicit chunking, not CSS flex-wrap, which is what guarantees exactly 2 per row on every
 * screen width instead of a "responsive" grid that reflows to 3+ columns on a wider/tablet
 * screen. Used identically for the collapsed preview and the expanded "See All" view — only the
 * *number of rows* changes between those two states, never the column count.
 */
export function chunkIntoRows<T>(accounts: T[], columns: number = ACCOUNT_GRID_COLUMNS): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < accounts.length; i += columns) {
    rows.push(accounts.slice(i, i + columns));
  }
  return rows;
}
