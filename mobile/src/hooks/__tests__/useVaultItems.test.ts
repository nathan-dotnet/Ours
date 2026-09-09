import { searchVaultItems } from '../useVaultItems';
import type { VaultItem } from '../../types/entities';

function item(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    couple_id: 'couple-1',
    title: 'Netflix',
    username: 'alice@example.com',
    encrypted_password: null,
    nonce: null,
    auth_tag: null,
    key_version: null,
    website_url: 'https://netflix.com',
    category: 'Streaming',
    notes: 'Family account',
    created_by_user_id: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by_user_id: 'user-1',
    version: 1,
    is_deleted: 0,
    ...overrides,
  };
}

describe('searchVaultItems', () => {
  const netflix = item({ id: 'n', title: 'Netflix', username: 'alice@example.com', category: 'Streaming' });
  const gmail = item({ id: 'g', title: 'Gmail', username: 'bob@gmail.com', category: 'Email', website_url: 'https://gmail.com' });
  const items = [netflix, gmail];

  it('returns everything for an empty query', () => {
    expect(searchVaultItems(items, '')).toEqual(items);
    expect(searchVaultItems(items, '   ')).toEqual(items);
  });

  it('matches by title', () => {
    expect(searchVaultItems(items, 'net').map((i) => i.id)).toEqual(['n']);
  });

  it('matches by username, case-insensitively', () => {
    expect(searchVaultItems(items, 'BOB@GMAIL').map((i) => i.id)).toEqual(['g']);
  });

  it('matches by website', () => {
    expect(searchVaultItems(items, 'gmail.com').map((i) => i.id)).toEqual(['g']);
  });

  it('matches by category', () => {
    expect(searchVaultItems(items, 'streaming').map((i) => i.id)).toEqual(['n']);
  });

  it('returns nothing for a query matching no field', () => {
    expect(searchVaultItems(items, 'nonexistent')).toEqual([]);
  });

  it('never matches against the encrypted password field', () => {
    const withCiphertext = item({ id: 'x', title: 'Something', encrypted_password: 'zzz-secret-blob' });
    expect(searchVaultItems([withCiphertext], 'zzz-secret-blob')).toEqual([]);
  });
});
