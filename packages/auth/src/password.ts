/**
 * Password hashing and generation. Ported from JojoCode packages/db/src/auth/password.ts @ a8f4056.
 */
import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

/**
 * `Algorithm.Argon2id`, written as its literal value: the package declares it as an
 * ambient const enum, which `isolatedModules` (required by Next.js) cannot reference.
 */
const ARGON2ID = 2;

/** OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane). */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** For passwords people choose (ADR-020). Generated ones are 12 random characters. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error('password must not be empty');
  return hash(password, ARGON2_OPTIONS);
}

/** False rather than throwing on a malformed stored hash: a corrupt row reads as "wrong password". */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/** Ambiguous characters (0/O, 1/l/I) removed so a printed badge reads unambiguously. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A random password for a generated account (participant import, first admin).
 * 12 characters from 56 is ~70 bits; CSPRNG via `randomInt`, no modulo bias.
 */
export function generatePassword(length = 12): string {
  if (length < MIN_PASSWORD_LENGTH) throw new Error(`length must be at least ${MIN_PASSWORD_LENGTH}`);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
