import { createVaultItemSchema, editVaultItemSchema } from '../vault';

function values(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Netflix',
    username: 'alice@example.com',
    password: 'correct horse battery staple',
    websiteUrl: 'https://netflix.com',
    category: 'Streaming',
    notes: 'Family account',
    ...overrides,
  };
}

describe('createVaultItemSchema', () => {
  it('accepts a well-formed item', () => {
    expect(createVaultItemSchema.safeParse(values()).success).toBe(true);
  });

  it('accepts every controlled category', () => {
    for (const category of ['Streaming', 'Social', 'Email', 'Shopping', 'Banking', 'Work', 'WiFi', 'Other']) {
      expect(createVaultItemSchema.safeParse(values({ category })).success).toBe(true);
    }
  });

  it('rejects an invalid category', () => {
    expect(createVaultItemSchema.safeParse(values({ category: 'NotACategory' })).success).toBe(false);
  });

  it('rejects a blank title', () => {
    expect(createVaultItemSchema.safeParse(values({ title: '  ' })).success).toBe(false);
  });

  it('requires a password', () => {
    expect(createVaultItemSchema.safeParse(values({ password: '' })).success).toBe(false);
  });

  it('accepts optional username, website, and notes', () => {
    expect(createVaultItemSchema.safeParse(values({ username: undefined, websiteUrl: undefined, notes: undefined })).success).toBe(true);
  });
});

describe('editVaultItemSchema', () => {
  it('accepts an empty password — meaning "leave it unchanged"', () => {
    expect(editVaultItemSchema.safeParse(values({ password: '' })).success).toBe(true);
    expect(editVaultItemSchema.safeParse(values({ password: undefined })).success).toBe(true);
  });

  it('still accepts a new password when the user is changing it', () => {
    expect(editVaultItemSchema.safeParse(values({ password: 'a-new-password' })).success).toBe(true);
  });

  it('still requires a title and a valid category', () => {
    expect(editVaultItemSchema.safeParse(values({ title: '' })).success).toBe(false);
    expect(editVaultItemSchema.safeParse(values({ category: 'NotACategory' })).success).toBe(false);
  });
});
