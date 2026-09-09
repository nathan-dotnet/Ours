import { z } from 'zod';

/** Mirrors the backend's VaultCategory constants exactly. */
export const VAULT_CATEGORIES = ['Streaming', 'Social', 'Email', 'Shopping', 'Banking', 'Work', 'WiFi', 'Other'] as const;

export type VaultCategoryValue = (typeof VAULT_CATEGORIES)[number];

const baseFields = {
  title: z.string().trim().min(1, 'Enter a title').max(200),
  username: z.string().trim().max(200).optional(),
  websiteUrl: z.string().trim().max(500).optional(),
  category: z.enum(VAULT_CATEGORIES),
  notes: z.string().trim().max(2000).optional(),
};

/** Password required — used by the Add Vault Item screen. */
export const createVaultItemSchema = z.object({
  ...baseFields,
  password: z.string().min(1, 'Enter a password').max(200),
});

/**
 * Password optional — used by the Edit screen. An empty value means "leave the password
 * unchanged" (see vaultRepository.updateLocally/VaultItemInput), never "set it to empty" — the
 * backend requires a non-empty password on create and simply leaves the existing encrypted value
 * alone whenever the payload omits it, so an edit that doesn't touch the password field must
 * behave the same way, not accidentally clear it.
 */
export const editVaultItemSchema = z.object({
  ...baseFields,
  password: z.string().max(200).optional(),
});

export type CreateVaultItemFormValues = z.infer<typeof createVaultItemSchema>;
export type EditVaultItemFormValues = z.infer<typeof editVaultItemSchema>;
