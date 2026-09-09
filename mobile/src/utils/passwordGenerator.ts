import * as Crypto from 'expo-crypto';

/**
 * Never `Math.random()` — that's a fast, non-cryptographic PRNG never meant to be
 * unpredictable, which is exactly the property a generated password needs. `expo-crypto`'s
 * `getRandomBytes` is backed by the platform's CSPRNG (the same source SecureStore/UUIDs use).
 */

const CHARACTER_SETS = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // no I/O — easy to misread
  lowercase: 'abcdefghijkmnpqrstuvwxyz', // no l
  numbers: '23456789', // no 0/1
  symbols: '!@#$%^&*-_=+',
} as const;

export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordGeneratorOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

/**
 * Picks a uniformly random index in [0, exclusiveMax) from a cryptographically secure byte
 * source via rejection sampling — a plain `byte % exclusiveMax` would be measurably biased
 * toward smaller indices whenever 256 isn't a multiple of exclusiveMax (true for nearly every
 * character-set size here), which would make some characters subtly more likely than others.
 */
function secureRandomIndex(exclusiveMax: number): number {
  const rejectionCeiling = 256 - (256 % exclusiveMax);
  while (true) {
    const [byte] = Crypto.getRandomBytes(1);
    if (byte < rejectionCeiling) {
      return byte % exclusiveMax;
    }
  }
}

/** Throws if every character set is disabled — there would be nothing to generate from. */
export function generatePassword(options: PasswordGeneratorOptions = DEFAULT_PASSWORD_OPTIONS): string {
  const pools = (['uppercase', 'lowercase', 'numbers', 'symbols'] as const).filter((key) => options[key]).map((key) => CHARACTER_SETS[key]);

  if (pools.length === 0) {
    throw new Error('Enable at least one character type to generate a password.');
  }

  const alphabet = pools.join('');
  const length = Math.max(1, Math.floor(options.length));

  // Guarantee at least one character from every enabled set, then fill the rest uniformly at
  // random from the combined alphabet, then shuffle — otherwise a short length could end up
  // silently missing a category the user explicitly asked for.
  const required = pools.length <= length ? pools.map((pool) => pool[secureRandomIndex(pool.length)]) : [];
  const remaining = Array.from({ length: length - required.length }, () => alphabet[secureRandomIndex(alphabet.length)]);
  const characters = [...required, ...remaining];

  // Fisher-Yates, using the same secure source for the shuffle positions.
  for (let i = characters.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }

  return characters.join('');
}
