import { coupleProfileSchema, joinCoupleSchema } from '../couple';

describe('joinCoupleSchema', () => {
  it('uppercases a lowercase invite code', () => {
    const result = joinCoupleSchema.safeParse({ inviteCode: 'ours-8k2f' });
    expect(result.success).toBe(true);
    expect(result.data?.inviteCode).toBe('OURS-8K2F');
  });

  it('rejects an empty invite code', () => {
    expect(joinCoupleSchema.safeParse({ inviteCode: '' }).success).toBe(false);
  });
});

describe('coupleProfileSchema', () => {
  it('accepts a well-formed date and empty nickname', () => {
    const result = coupleProfileSchema.safeParse({ anniversaryDate: '2020-06-15' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty-string date (cleared field)', () => {
    expect(coupleProfileSchema.safeParse({ anniversaryDate: '' }).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(coupleProfileSchema.safeParse({ anniversaryDate: '06/15/2020' }).success).toBe(false);
  });
});
