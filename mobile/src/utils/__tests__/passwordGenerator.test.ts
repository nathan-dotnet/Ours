import { DEFAULT_PASSWORD_OPTIONS, generatePassword } from '../passwordGenerator';

describe('generatePassword', () => {
  it('generates a password of the requested length', () => {
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 20 })).toHaveLength(20);
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 8 })).toHaveLength(8);
  });

  it('two generated passwords are (almost certainly) different — never a fixed/predictable output', () => {
    const first = generatePassword();
    const second = generatePassword();
    expect(first).not.toBe(second);
  });

  it('includes at least one character from every enabled set when length allows it', () => {
    const password = generatePassword({ length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true });
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[!@#$%^&*\-_=+]/);
  });

  it('only uses the enabled character sets', () => {
    const numbersOnly = generatePassword({ length: 30, uppercase: false, lowercase: false, numbers: true, symbols: false });
    expect(numbersOnly).toMatch(/^[0-9]+$/);

    const lettersOnly = generatePassword({ length: 30, uppercase: true, lowercase: true, numbers: false, symbols: false });
    expect(lettersOnly).toMatch(/^[A-Za-z]+$/);
  });

  it('throws when every character set is disabled', () => {
    expect(() => generatePassword({ length: 16, uppercase: false, lowercase: false, numbers: false, symbols: false })).toThrow();
  });

  it('generates a reasonable spread of characters across many runs (not obviously biased)', () => {
    // A crude sanity check that rejection sampling is actually happening, not a rigorous
    // statistical test — this would fail hard if secureRandomIndex regressed to plain modulo
    // and somehow made one digit wildly more common than the others.
    const counts = new Map<string, number>();
    for (let i = 0; i < 500; i++) {
      const password = generatePassword({ length: 1, uppercase: false, lowercase: false, numbers: true, symbols: false });
      counts.set(password, (counts.get(password) ?? 0) + 1);
    }
    // 8 possible digits (see passwordGenerator's numbers set, which excludes 0/1) — every one
    // should appear at least once across 500 draws.
    expect(counts.size).toBe(8);
  });
});
