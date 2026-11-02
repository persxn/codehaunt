/**
 * Ported from JojoCode packages/db/src/auth/rate-limit.ts @ a8f4056 (ADR-001). "Class"/"school"
 * below read as "venue": participants share NATs and hotspots just as a classroom does.
 *
 * Login throttling. CodeHaunt change (ADR-020): no bucket ever refuses, they only slow attempts
 * down. JojoCode's per-username and per-IP refusals let anyone who knows a username lock that
 * account out, or lock out a whole venue behind one NAT; every CodeHaunt password is generated
 * (~70 bits), so a slowed-down guesser gains nothing. The original reasoning follows.
 *
 * The threat here is guessing, and the constraint that shapes everything is
 * that a whole class shares one NAT address. Throttle mainly on IP and the
 * thirtieth student to arrive at 9am is locked out of their own lesson because
 * of somebody else's typos. So:
 *
 *   - the *username* limit is strict, because that is where guessing actually
 *     happens and it only ever affects one account;
 *   - the *IP* limit is deliberately loose, high enough that a room full of
 *     people fumbling their new passwords stays under it, low enough to stop a
 *     script working through a wordlist;
 *   - only *failures* count, so ordinary sign-ins never consume budget;
 *   - a success clears the counter, so one bad morning does not follow a
 *     student around for the rest of the window.
 *
 * Held in memory. The platform runs as a single process, and a restart clearing
 * the counters is an acceptable trade for not writing a database row on every
 * failed keystroke. If it ever runs multi-instance this needs to move to Postgres.
 */

const WINDOW_MS = 15 * 60 * 1000;

/** Failures on one username before its attempts are slowed. */
export const MAX_USERNAME_FAILURES = 8;

/** Failures from one address before its attempts are slowed. Loose: a venue shares one NAT. */
export const MAX_IP_FAILURES = 60;

/** Failures across the whole site in one minute before every attempt is slowed. */
export const MAX_GLOBAL_FAILURES_PER_MINUTE = 40;
const GLOBAL_WINDOW_MS = 60 * 1000;

/**
 * How long an attempt waits while a bucket it falls in is hot. Applied before the password is
 * checked and the same for every guess, so it only costs throughput. A person typing the right
 * password still gets in, a couple of seconds later.
 */
export const USERNAME_SLOWDOWN_MS = 2_000;
/** People may choose their passwords (ADR-020), so the per-username wait grows: +2 s per 8 failures. */
export const MAX_USERNAME_SLOWDOWN_MS = 10_000;
export const IP_SLOWDOWN_MS = 1_500;
export const GLOBAL_SLOWDOWN_MS = 1_500;

interface Bucket {
  failures: number[];
}

const byUsername = new Map<string, Bucket>();
const byIp = new Map<string, Bucket>();
const global: Bucket = { failures: [] };

function prune(bucket: Bucket, now: number): number[] {
  bucket.failures = bucket.failures.filter((at) => now - at < WINDOW_MS);
  return bucket.failures;
}

/** Drops empty buckets so a day of logins cannot grow the maps without bound. */
function sweep(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map) {
    if (prune(bucket, now).length === 0) map.delete(key);
  }
}

let lastSweep = 0;

function failuresIn(map: Map<string, Bucket>, key: string, now: number): number {
  const bucket = map.get(key);
  return bucket ? prune(bucket, now).length : 0;
}

/** Milliseconds this attempt should wait before the password is checked. Never a refusal. */
export function loginDelayMs(username: string, ip?: string | undefined): number {
  const now = Date.now();
  if (now - lastSweep > WINDOW_MS) {
    sweep(byUsername, now);
    sweep(byIp, now);
    lastSweep = now;
  }
  global.failures = global.failures.filter((at) => now - at < GLOBAL_WINDOW_MS);

  let delay = 0;
  const steps = Math.floor(failuresIn(byUsername, username.trim().toLowerCase(), now) / MAX_USERNAME_FAILURES);
  if (steps > 0) delay = Math.max(delay, Math.min(steps * USERNAME_SLOWDOWN_MS, MAX_USERNAME_SLOWDOWN_MS));
  if (ip && failuresIn(byIp, ip, now) >= MAX_IP_FAILURES) delay = Math.max(delay, IP_SLOWDOWN_MS);
  if (global.failures.length >= MAX_GLOBAL_FAILURES_PER_MINUTE) delay = Math.max(delay, GLOBAL_SLOWDOWN_MS);
  return delay;
}

export function recordLoginFailure(username: string, ip?: string | undefined): void {
  const now = Date.now();
  const key = username.trim().toLowerCase();

  const userBucket = byUsername.get(key) ?? { failures: [] };
  userBucket.failures.push(now);
  byUsername.set(key, userBucket);

  if (ip) {
    const ipBucket = byIp.get(ip) ?? { failures: [] };
    ipBucket.failures.push(now);
    byIp.set(ip, ipBucket);
  }

  // Counted whatever the address claimed to be, which is the point of it.
  global.failures.push(now);
}

/** Clears the username and IP counters after a successful sign-in. */
export function clearLoginRate(username: string, ip?: string | undefined): void {
  byUsername.delete(username.trim().toLowerCase());
  if (ip) byIp.delete(ip);
}

/** Test-only reset. */
export function resetLoginRateLimits(): void {
  byUsername.clear();
  byIp.clear();
  global.failures = [];
  lastSweep = 0;
}
