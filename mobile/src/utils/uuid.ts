import * as Crypto from 'expo-crypto';

/** Device-generated UUID for new local entities (see repositories). */
export function generateUuid(): string {
  return Crypto.randomUUID();
}
