const mockHasHardwareAsync = jest.fn();
const mockIsEnrolledAsync = jest.fn();
const mockAuthenticateAsync = jest.fn();

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (...args: unknown[]) => mockHasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => mockIsEnrolledAsync(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
}));

import { authenticateToRevealPassword } from '../vaultAuth';

describe('authenticateToRevealPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns "authenticated" on a successful OS-level check', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: true });

    expect(await authenticateToRevealPassword()).toBe('authenticated');
    expect(mockAuthenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false }));
  });

  it('returns "cancelled" when the user cancels or fails the check', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });

    expect(await authenticateToRevealPassword()).toBe('cancelled');
  });

  it('returns "unavailable" when there is no hardware and nothing enrolled at all', async () => {
    mockHasHardwareAsync.mockResolvedValue(false);
    mockIsEnrolledAsync.mockResolvedValue(false);

    expect(await authenticateToRevealPassword()).toBe('unavailable');
    expect(mockAuthenticateAsync).not.toHaveBeenCalled();
  });

  it('returns "unavailable" when the OS check itself reports unavailable/not enrolled', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'not_enrolled' });

    expect(await authenticateToRevealPassword()).toBe('unavailable');
  });

  it('passes a custom prompt message through', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: true });

    await authenticateToRevealPassword('Copy Password');

    expect(mockAuthenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ promptMessage: 'Copy Password' }));
  });
});
