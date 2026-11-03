/**
 * Contest clock logic (ADR-028).
 *
 * The contest runs `durationMinutes` from its actual start (`startedAt`, set by the Start control; the scheduled
 * `startsAt` until then). Pauses push the end back: `pausedMs` is the sum of finished pauses, `pausedAt` the start of
 * the current one. `extraMinutes` is a participant's own extra time.
 */
import type { EventStatus } from '@codehaunt/contracts';

export type ContestPhase = 'not_started' | 'running' | 'paused' | 'ended';

export interface ClockInput {
  /** Event status from the DB. */
  status: EventStatus;
  /** ISO timestamp of when the contest starts. */
  startsAt: string;
  /** Duration in minutes (excluding extra). */
  durationMinutes: number;
  /** Minutes before the end when the contest freezes. */
  freezeMinutes: number;
  /** Additional minutes added to the contest duration (default 0). */
  extraMinutes?: number;
  /** Actual start (events.lockedAt); overrides `startsAt` when set. */
  startedAt?: Date | string | null;
  /** Start of the current pause (events.pausedAt). */
  pausedAt?: Date | string | null;
  /** Finished pauses in milliseconds (events.pausedMs). */
  pausedMs?: number;
}

export interface ClockState {
  /** Current phase. */
  phase: ContestPhase;
  /** Date objects for start/end/freeze. */
  startsAt: Date;
  endsAt: Date;
  freezesAt: Date;
  /** Milliseconds left until the end (non‑negative). */
  msLeft: number;
  /** Whether the contest is frozen (running or paused after freeze time). */
  frozen: boolean;
  /** Contest time elapsed, pauses excluded; 0 before the start. */
  elapsedMs: number;
}

/**
 * Compute the contest clock state.
 * @param input Input parameters.
 * @param now Current time (in tests injected).
 */
export function contestClock(input: ClockInput, now: Date): ClockState {
  const extra = input.extraMinutes ?? 0;
  const startsAt = new Date(input.startedAt ?? input.startsAt);
  const pausedAt = input.pausedAt ? new Date(input.pausedAt) : null;
  const paused = (input.pausedMs ?? 0) + (pausedAt ? Math.max(0, now.getTime() - pausedAt.getTime()) : 0);
  const endsAt = new Date(startsAt.getTime() + (input.durationMinutes + extra) * 60_000 + paused);
  const freezesAt = new Date(endsAt.getTime() - input.freezeMinutes * 60_000);

  // Determine base phase based on status.
  let phase: ContestPhase;
  switch (input.status) {
    case 'DRAFT':
    case 'CHECK_IN':
      phase = 'not_started';
      break;
    case 'RUNNING':
      if (now < startsAt) {
        phase = 'not_started';
      } else if (now < endsAt) {
        phase = 'running';
      } else {
        phase = 'ended';
      }
      break;
    case 'PAUSED':
      phase = 'paused';
      break;
    case 'ENDED':
    case 'JUDGING':
    case 'PUBLISHED':
      phase = 'ended';
      break;
    default: {
      // A new EventStatus must be mapped here: this line stops compiling until it is.
      const unknown: never = input.status;
      throw new Error(`unknown event status ${String(unknown)}`);
    }
  }

  const msLeft = (phase === 'running' || phase === 'paused') ? Math.max(0, endsAt.getTime() - now.getTime()) : 0;
  const frozen = ((phase === 'running' || phase === 'paused') && now >= freezesAt) || phase === 'ended';

  const elapsedMs = phase === 'not_started' ? 0 : Math.max(0, Math.min(now.getTime(), endsAt.getTime()) - startsAt.getTime() - paused);

  return { phase, startsAt, endsAt, freezesAt, msLeft, frozen, elapsedMs };
}
