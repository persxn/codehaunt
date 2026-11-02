/**
 * Contest clock logic.
 *
 * Computes the current phase of a contest and timing information.
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
}

/**
 * Compute the contest clock state.
 * @param input Input parameters.
 * @param now Current time (in tests injected).
 */
export function contestClock(input: ClockInput, now: Date): ClockState {
  const extra = input.extraMinutes ?? 0;
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + (input.durationMinutes + extra) * 60_000);
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

  return { phase, startsAt, endsAt, freezesAt, msLeft, frozen };
}
