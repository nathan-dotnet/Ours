import { ACCOUNT_GRID_PREVIEW_COUNT, chunkIntoRows, getAccountGridView } from '../accountGrid';

function accounts(count: number): { id: string }[] {
  return Array.from({ length: count }, (_, i) => ({ id: `account-${i}` }));
}

describe('getAccountGridView', () => {
  it('never limits the underlying data — an unlimited number of accounts can exist', () => {
    const view = getAccountGridView(accounts(37), true);
    expect(view.visible).toHaveLength(37);
  });

  it('shows everything with no "See All" when there are only 1-2 accounts (no misleading affordance)', () => {
    expect(getAccountGridView(accounts(1), false).hasMore).toBe(false);
    expect(getAccountGridView(accounts(2), false).hasMore).toBe(false);
  });

  it('shows everything with no "See All" for exactly a full preview (4 accounts = 2 rows of 2)', () => {
    const view = getAccountGridView(accounts(ACCOUNT_GRID_PREVIEW_COUNT), false);
    expect(view.hasMore).toBe(false);
    expect(view.visible).toHaveLength(ACCOUNT_GRID_PREVIEW_COUNT);
  });

  it('collapses to the preview count and flags hasMore once there are more accounts than that', () => {
    const view = getAccountGridView(accounts(9), false);
    expect(view.hasMore).toBe(true);
    expect(view.visible).toHaveLength(ACCOUNT_GRID_PREVIEW_COUNT);
  });

  it('expanded shows every account, regardless of count', () => {
    const view = getAccountGridView(accounts(9), true);
    expect(view.hasMore).toBe(true); // still true — "See All" toggles back to collapse
    expect(view.visible).toHaveLength(9);
  });

  it('an empty account list has nothing to show and no "See All"', () => {
    const view = getAccountGridView(accounts(0), false);
    expect(view.visible).toHaveLength(0);
    expect(view.hasMore).toBe(false);
  });
});

describe('chunkIntoRows', () => {
  it('always produces rows of exactly 2 — never 3, 4, or more, regardless of how many accounts exist', () => {
    for (const count of [1, 2, 3, 4, 5, 6, 10, 12, 37]) {
      const rows = chunkIntoRows(accounts(count));
      for (const row of rows) {
        expect(row.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('produces the exact row breakdown for 6 accounts: [1,2] [3,4] [5,6]', () => {
    const rows = chunkIntoRows(accounts(6));
    expect(rows.map((row) => row.map((a) => a.id))).toEqual([
      ['account-0', 'account-1'],
      ['account-2', 'account-3'],
      ['account-4', 'account-5'],
    ]);
  });

  it('produces 6 rows of 2 for 12 accounts', () => {
    const rows = chunkIntoRows(accounts(12));
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.length === 2)).toBe(true);
  });

  it('a trailing odd account gets its own row of 1, not folded into a wider row', () => {
    const rows = chunkIntoRows(accounts(5));
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveLength(1);
  });

  it('the collapsed preview (4 accounts) and the expanded view (all of them) both chunk into the same fixed 2-column shape', () => {
    const all = accounts(10);
    const collapsed = getAccountGridView(all, false);
    const expanded = getAccountGridView(all, true);

    expect(chunkIntoRows(collapsed.visible)).toEqual([
      [all[0], all[1]],
      [all[2], all[3]],
    ]);
    expect(chunkIntoRows(expanded.visible)).toHaveLength(5);
    expect(chunkIntoRows(expanded.visible).every((row) => row.length <= 2)).toBe(true);
  });

  it('returns no rows for an empty list', () => {
    expect(chunkIntoRows(accounts(0))).toEqual([]);
  });
});
