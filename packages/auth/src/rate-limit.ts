/**
 * Ported from JojoCode packages/db/src/auth/rate-limit.ts @ a8f4056 (ADR-001). "Class"/"school"
 * below read as "venue": participants share NATs and hotspots just as a classroom does.
 *
 * Login throttling.
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

/** One account, one person: a strict ceiling that cannot affect anybody else. */
export const MAX_USERNAME_FAILURES = 8;

/** A shared classroom address. Loose on purpose — see the note above. */
export const MAX_IP_FAILURES = 60;

/**
 * Failures across the whole school in one minute, whoever they came from.
 *
 * The third bucket, and the one that catches the attack the other two cannot.
 * Spraying is one attempt against each of a hundred usernames: it never touches
 * the per-username ceiling of eight, and the per-address ceiling is defeated by
 * a rotated `X-Forwarded-For`, which nothing here can verify — the app is
 * behind a tunnel that connects over loopback, so every request carries the
 * proxy's address and the header is the only thing that claims otherwise.
 *
 * This bucket needs no identity at all, which is exactly why it holds. A
 * hundred and nine accounts on one site produce nowhere near forty failed
 * sign-ins a minute in ordinary use — a whole class arriving at nine o'clock
 * and fumbling new passwords is a handful a minute — and a wordlist produces
 * far more.
 *
 * ── Why this slows attempts down rather than refusing them ────────────────
 *
 * The first version of this refused every sign-in while the bucket was hot,
 * and the QA suite locked itself out inside a second — which is exactly what
 * would happen to a class if somebody sprayed the site during a test. A bucket
 * with no identity in it cannot refuse selectively, so refusing at all turns a
 * failed attack into a successful denial of service against ninety students.
 *
 * A delay has neither problem. Somebody who types their password correctly
 * still gets in, a second or two later and probably without noticing. Somebody
 * working through a wordlist has their throughput cut by a factor of ten and
 * gains nothing, because the delay is applied before the password is checked
 * and is the same whether the guess was close or nonsense.
 */
export const MAX_GLOBAL_FAILURES_PER_MINUTE = 40;
const GLOBAL_WINDOW_MS = 60 * 1000;

/** How long an attempt waits while the school-wide failure rate is anomalous. */
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

/** Drops empty buckets so a term of logins cannot grow the maps without bound. */
function sweep(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map) {
    if (prune(bucket, now).length === 0) map.delete(key);
  }
}

let lastSweep = 0;

export interface RateVerdict {
  allowed: boolean;
  /** Seconds until the caller may try again. Only meaningful when blocked. */
  retryAfterSeconds: number;
  reason?: 'username' | 'ip';
  /**
   * Milliseconds this attempt should wait before the password is checked.
   *
   * Non-zero only while the school-wide failure rate is anomalous. Never a
   * refusal — see the note on `MAX_GLOBAL_FAILURES_PER_MINUTE`.
   */
  delayMs: number;
}

export function checkLoginRate(username: string, ip?: string | undefined): RateVerdict {
  const now = Date.now();

  if (now - lastSweep > WINDOW_MS) {
    sweep(byUsername, now);
    sweep(byIp, now);
    lastSweep = now;
  }

  const key = username.trim().toLowerCase();
  const userBucket = byUsername.get(key);
  const userFailures = userBucket ? prune(userBucket, now) : [];

  if (userFailures.length >= MAX_USERNAME_FAILURES) {
    const oldest = userFailures[0]!;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
      reason: 'username',
      delayMs: 0,
    };
  }

  if (ip) {
    const ipBucket = byIp.get(ip);
    const ipFailures = ipBucket ? prune(ipBucket, now) : [];
    if (ipFailures.length >= MAX_IP_FAILURES) {
      const oldest = ipFailures[0]!;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
        reason: 'ip',
        delayMs: 0,
      };
    }
  }

  // The bucket with no identity in it. It slows every attempt down while it is
  // hot and refuses none of them.
  global.failures = global.failures.filter((at) => now - at < GLOBAL_WINDOW_MS);
  const hot = global.failures.length >= MAX_GLOBAL_FAILURES_PER_MINUTE;

  return { allowed: true, retryAfterSeconds: 0, delayMs: hot ? GLOBAL_SLOWDOWN_MS : 0 };
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

/**
 * Clears the counters after a successful sign-in.
 *
 * The IP counter is cleared too: somebody signing in proves the address is not
 * purely hostile, and it stops a class being throttled by whoever mistyped
 * their password four times before getting it right.
 */
export function clearLoginRate(username: string, ip?: string | undefined): void {
  byUsername.delete(username.trim().toLowerCase());
  if (ip) byIp.delete(ip);
}

/** Wording for a blocked attempt. Vague on purpose — no account enumeration. */
export function rateLimitMessage(verdict: RateVerdict): string {
  const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
  const wait = minutes <= 1 ? 'a minute' : `${minutes} minutes`;
  return `Too many failed sign-in attempts. Try again in ${wait}, or ask an organizer at the desk.`;
}

/** Test-only reset. */
export function resetLoginRateLimits(): void {
  byUsername.clear();
  byIp.clear();
  global.failures = [];
  lastSweep = 0;
}
