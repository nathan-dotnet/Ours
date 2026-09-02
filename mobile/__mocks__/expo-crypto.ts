// jest-expo doesn't provide a working native binding for expo-crypto's randomUUID in the test
// environment; this backs it with Node's own crypto.randomUUID so generated ids are real UUIDs.
import { randomUUID as nodeRandomUUID } from 'node:crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}
