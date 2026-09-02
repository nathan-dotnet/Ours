import { z } from 'zod';

export const joinCoupleSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(1, 'Enter your invite code')
    .max(20)
    .transform((value) => value.toUpperCase()),
});
export type JoinCoupleFormValues = z.infer<typeof joinCoupleSchema>;

export const coupleProfileSchema = z.object({
  nickname: z.string().trim().max(100).optional(),
  anniversaryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
});
export type CoupleProfileFormValues = z.infer<typeof coupleProfileSchema>;
