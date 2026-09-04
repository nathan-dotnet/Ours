import { ACCOUNT_GRID_PREVIEW_COUNT, getAccountGridView } from '../accountGrid';

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
