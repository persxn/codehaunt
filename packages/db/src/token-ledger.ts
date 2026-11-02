/**
 * Token budget accounting (ADR-022). The balance is SUM(token_ledger.delta) per participant.
 * Before a model call the web API reserves tokens under the participant's row lock; after it, one
 * RELEASE returns the unused part (everything, if the call failed). Every reservation fits the
 * balance read under the lock, so the balance never goes negative.
 * Invariant (audit L4): every writer of a negative delta (RESERVE here, admin ADJUSTMENT later) must take the same
 * participant row lock and check the balance first, or "never negative" no longer holds.
 * Security-critical: Claude-owned.
 */
import type { PrismaClient } from './generated/client.ts';

/** An unsettled reservation older than this is released in full at the participant's next reserve. */
export const STALE_RESERVATION_MS = 10 * 60 * 1000;

export class BudgetExhausted extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super(`token budget exhausted (${remaining} left)`);
    this.remaining = remaining;
  }
}

const reserveKey = (turnId: string) => `turn:${turnId}:reserve`;
const settleKey = (turnId: string) => `turn:${turnId}:settle`;

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function sum(tx: Tx, participantId: string): Promise<number> {
  const r = await tx.tokenLedger.aggregate({ where: { participantId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

export async function tokenBalance(prisma: PrismaClient, participantId: string): Promise<number> {
  return sum(prisma as unknown as Tx, participantId);
}

export interface ReserveInput {
  eventId: string;
  participantId: string;
  /** The PromptTurn this call belongs to (one reservation per turn). */
  promptTurnId: string;
  /** Most the call may use: context limit + reply cap. */
  wanted: number;
  now: Date;
}

/**
 * Reserves min(balance, wanted) tokens for one turn. Throws BudgetExhausted when nothing is left.
 * Idempotent per turn: a retry returns the existing reservation.
 */
export async function reserveTokens(prisma: PrismaClient, input: ReserveInput): Promise<{ reserved: number; remaining: number }> {
  if (!Number.isInteger(input.wanted) || input.wanted < 1) throw new RangeError('wanted must be a positive integer');
  return prisma.$transaction(async (tx) => {
    // Serialises every reserve/settle of this participant.
    await tx.$queryRaw`SELECT id FROM participants WHERE id = ${input.participantId} FOR UPDATE`;

    const existing = await tx.tokenLedger.findUnique({ where: { idempotencyKey: reserveKey(input.promptTurnId) } });
    if (existing) {
      if (existing.participantId !== input.participantId) throw new Error('reservation belongs to another participant');
      // A settled turn is finished: handing its reservation back would make a second call free (audit M1).
      if (await tx.tokenLedger.findUnique({ where: { idempotencyKey: settleKey(input.promptTurnId) } })) {
        throw new Error('turn already settled; a new call needs a new turn');
      }
      return { reserved: -existing.delta, remaining: await sum(tx, input.participantId) };
    }

    await releaseStale(tx, input.participantId, input.now);
    const balance = await sum(tx, input.participantId);
    if (balance <= 0) throw new BudgetExhausted(balance);
    const reserved = Math.min(balance, input.wanted);
    await tx.tokenLedger.create({
      data: {
        eventId: input.eventId,
        participantId: input.participantId,
        promptTurnId: input.promptTurnId,
        kind: 'RESERVE',
        delta: -reserved,
        idempotencyKey: reserveKey(input.promptTurnId),
      },
    });
    return { reserved, remaining: balance - reserved };
  });
}

/**
 * Settles a turn's reservation: charges `used` (clamped to the reservation) and releases the rest.
 * `used = 0` releases everything (failed call, never charged). Idempotent: only the first settle counts.
 * Returns the tokens actually charged.
 */
export async function settleTokens(
  prisma: PrismaClient,
  input: { participantId: string; promptTurnId: string; used: number },
): Promise<number> {
  if (!Number.isInteger(input.used) || input.used < 0) throw new RangeError('used must be a non-negative integer');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM participants WHERE id = ${input.participantId} FOR UPDATE`;
    const reservation = await tx.tokenLedger.findUnique({ where: { idempotencyKey: reserveKey(input.promptTurnId) } });
    if (!reservation || reservation.participantId !== input.participantId) throw new Error('no reservation for this turn');
    const settled = await tx.tokenLedger.findUnique({ where: { idempotencyKey: settleKey(input.promptTurnId) } });
    const reserved = -reservation.delta;
    if (settled) return reserved - settled.delta;
    const charged = Math.min(input.used, reserved);
    await tx.tokenLedger.create({
      data: {
        eventId: reservation.eventId,
        participantId: input.participantId,
        promptTurnId: input.promptTurnId,
        kind: 'RELEASE',
        delta: reserved - charged,
        idempotencyKey: settleKey(input.promptTurnId),
        reason: input.used > reserved ? `reported ${input.used} > reserved ${reserved}` : null,
      },
    });
    return charged;
  });
}

/** Releases, in full, this participant's reservations unsettled for STALE_RESERVATION_MS (e.g. web crashed mid-call). */
async function releaseStale(tx: Tx, participantId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_RESERVATION_MS);
  const open = await tx.$queryRaw<Array<{ eventId: string; promptTurnId: string; delta: number }>>`
    SELECT r."eventId", r."promptTurnId", r.delta FROM token_ledger r
    WHERE r."participantId" = ${participantId} AND r.kind = 'RESERVE' AND r."createdAt" < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM token_ledger s WHERE s."idempotencyKey" = 'turn:' || r."promptTurnId" || ':settle')`;
  for (const r of open) {
    await tx.tokenLedger.create({
      data: {
        eventId: r.eventId,
        participantId,
        promptTurnId: r.promptTurnId,
        kind: 'RELEASE',
        delta: -r.delta,
        idempotencyKey: settleKey(r.promptTurnId),
        reason: 'stale reservation released',
      },
    });
  }
}
