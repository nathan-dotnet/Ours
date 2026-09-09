const mockGetIsOnline = jest.fn();
jest.mock('../connectivity', () => ({ getIsOnline: (...args: unknown[]) => mockGetIsOnline(...args) }));

const mockAuthenticateToRevealPassword = jest.fn();
jest.mock('../vaultAuth', () => ({ authenticateToRevealPassword: (...args: unknown[]) => mockAuthenticateToRevealPassword(...args) }));

const mockRevealVaultPassword = jest.fn();
jest.mock('../api', () => ({ api: { revealVaultPassword: (...args: unknown[]) => mockRevealVaultPassword(...args) } }));

const mockSetStringAsync = jest.fn();
const mockGetStringAsync = jest.fn();
jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
  getStringAsync: (...args: unknown[]) => mockGetStringAsync(...args),
}));

import { copyVaultPassword, revealVaultPassword, VaultRevealError } from '../vaultReveal';

describe('revealVaultPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws VaultRevealError("offline") without ever calling the API when offline', async () => {
    mockGetIsOnline.mockResolvedValue(false);

    await expect(revealVaultPassword('item-1')).rejects.toMatchObject({ reason: 'offline' });
    expect(mockAuthenticateToRevealPassword).not.toHaveBeenCalled();
    expect(mockRevealVaultPassword).not.toHaveBeenCalled();
  });

  it('throws VaultRevealError("auth_unavailable") without calling the API when no local auth is available', async () => {
    mockGetIsOnline.mockResolvedValue(true);
    mockAuthenticateToRevealPassword.mockResolvedValue('unavailable');

    await expect(revealVaultPassword('item-1')).rejects.toMatchObject({ reason: 'auth_unavailable' });
    expect(mockRevealVaultPassword).not.toHaveBeenCalled();
  });

  it('throws VaultRevealError("auth_cancelled") without calling the API when the user cancels', async () => {
    mockGetIsOnline.mockResolvedValue(true);
    mockAuthenticateToRevealPassword.mockResolvedValue('cancelled');

    await expect(revealVaultPassword('item-1')).rejects.toMatchObject({ reason: 'auth_cancelled' });
    expect(mockRevealVaultPassword).not.toHaveBeenCalled();
  });

  it('calls the reveal API and returns the password only after both online and auth checks pass', async () => {
    mockGetIsOnline.mockResolvedValue(true);
    mockAuthenticateToRevealPassword.mockResolvedValue('authenticated');
    mockRevealVaultPassword.mockResolvedValue({ password: 'correct horse battery staple' });

    const password = await revealVaultPassword('item-1');

    expect(password).toBe('correct horse battery staple');
    expect(mockRevealVaultPassword).toHaveBeenCalledWith('item-1');
  });

  it('is an instance of VaultRevealError with the expected message for offline', async () => {
    mockGetIsOnline.mockResolvedValue(false);
    try {
      await revealVaultPassword('item-1');
      fail('expected revealVaultPassword to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(VaultRevealError);
      expect((error as Error).message).toBe('You need to be online to reveal this password.');
    }
  });
});

describe('copyVaultPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reveals then copies the password to the clipboard', async () => {
    mockGetIsOnline.mockResolvedValue(true);
    mockAuthenticateToRevealPassword.mockResolvedValue('authenticated');
    mockRevealVaultPassword.mockResolvedValue({ password: 'my-password' });

    await copyVaultPassword('item-1');

    expect(mockSetStringAsync).toHaveBeenCalledWith('my-password');
  });

  it('propagates the same VaultRevealError as revealVaultPassword when offline, without touching the clipboard', async () => {
    mockGetIsOnline.mockResolvedValue(false);

    await expect(copyVaultPassword('item-1')).rejects.toMatchObject({ reason: 'offline' });
    expect(mockSetStringAsync).not.toHaveBeenCalled();
  });

  it('clears the clipboard after the configured delay if it still holds the copied password', async () => {
    mockGetIsOnline.mockResolvedValue(true);
    mockAuthenticateToRevealPassword.mockResolvedValue('authenticated');
    mockRevealVaultPassword.mockResolvedValue({ password: 'my-password' });
    mockGetStringAsync.mockResolvedValue('my-password'); // clipboard unchanged since the copy

    await copyVaultPassword('item-1');
    await jest.runAllTimersAsync();

    expect(mockSetStringAsync).toHaveBeenLastCalledWith('');
  });

  it('does NOT clear the clipboard if the user copied something else in the meantime', async () => {
    mockGetIsOnline.mockResolvedValue(true);
    mockAuthenticateToRevealPassword.mockResolvedValue('authenticated');
    mockRevealVaultPassword.mockResolvedValue({ password: 'my-password' });
    mockGetStringAsync.mockResolvedValue('something the user copied afterward');

    await copyVaultPassword('item-1');
    await jest.runAllTimersAsync();

    // Only the original copy — never a follow-up clear, since the clipboard content changed.
    expect(mockSetStringAsync).toHaveBeenCalledTimes(1);
    expect(mockSetStringAsync).toHaveBeenCalledWith('my-password');
  });
});
