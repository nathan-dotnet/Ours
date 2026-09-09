// jest-expo doesn't provide a working native binding for expo-crypto in the test environment;
// this backs both functions with Node's own crypto so tests get real random data.
import { randomBytes, randomUUID as nodeRandomUUID } from 'node:crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}
