import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '../auth';

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    const result = registerSchema.safeParse({ displayName: 'Alice', email: 'alice@example.com', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it.each([
    ['blank name', { displayName: '', email: 'a@b.com', password: 'password123' }],
    ['invalid email', { displayName: 'Alice', email: 'not-an-email', password: 'password123' }],
    ['short password', { displayName: 'Alice', email: 'a@b.com', password: 'short' }],
  ])('rejects %s', (_label, input) => {
    expect(registerSchema.safeParse(input).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a valid login', () => {
    expect(loginSchema.safeParse({ email: 'alice@example.com', password: 'anything' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ email: 'alice@example.com', password: '' }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'alice@example.com' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts matching passwords of sufficient length', () => {
    const result = resetPasswordSchema.safeParse({ newPassword: 'NewPassword123', confirmPassword: 'NewPassword123' });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({ newPassword: 'NewPassword123', confirmPassword: 'Different456' });
    expect(result.success).toBe(false);
  });

  it('rejects a new password shorter than 8 characters', () => {
    const result = resetPasswordSchema.safeParse({ newPassword: 'short', confirmPassword: 'short' });
    expect(result.success).toBe(false);
  });
});
