/**
 * Creates a fresh E2E event (running now) with one problem, a checked-in participant per language and an admin,
 * all with a known random password, and writes their logins to e2e/.state.json (git-ignored). Refuses production.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { hashPassword } from '@codehaunt/auth';
import { EventConfig } from '@codehaunt/contracts';
import { createPrismaClient } from '@codehaunt/db';

export default async function globalSetup() {
  if (process.env.NODE_ENV === 'production') throw new Error('e2e: refusing to run against production');
  const prisma = createPrismaClient();
  const tag = Date.now().toString(36);
  const password = `e2e ${randomBytes(9).toString('base64url')} lantern`;
  const passwordHash = await hashPassword(password);
  const config = EventConfig.parse({
    branding: { title: 'E2E' },
    schedule: { checkInAt: new Date(Date.now() - 3_600_000).toISOString(), startsAt: new Date(Date.now() - 60_000).toISOString(), durationMinutes: 180 },
    model: { baseUrl: process.env.GATEWAY_URL ?? 'http://gateway.invalid', name: 'junior', systemPromptVersion: 'v1' },
    judge: { rubricVersion: 'v1' },
    consent: { text: 'I agree that my prompts, replies and code are logged and judged.' },
  });
  const event = await prisma.event.create({ data: { slug: `e2e-${tag}`, name: `E2E ${tag}`, status: 'RUNNING', config, lockedAt: new Date() } });
  await prisma.problem.create({
    data: {
      eventId: event.id, slug: 'sum', title: 'Sum of two integers', difficulty: 'EASY', ord: 0, timeLimitMs: 2000, memoryLimitMb: 128,
      statement: 'Read two integers a and b (|a|, |b| ≤ 10^9) and print a + b.', checker: { kind: 'caseInsensitive' },
      testCases: {
        create: [
          { visibility: 'VISIBLE', ord: 0, input: '1 2\n', expectedOutput: '3' },
          { visibility: 'VISIBLE', ord: 1, input: '-5 10\n', expectedOutput: '5' },
          // Distinctive numbers that appear nowhere else: participant.spec.ts scans every response for them.
          { visibility: 'HIDDEN', ord: 0, input: '987654321 123456788\n', expectedOutput: '1111111109' },
          { visibility: 'HIDDEN', ord: 1, input: '-999999937 -1\n', expectedOutput: '-999999938' },
        ],
      },
    },
  });
  const users: Record<string, string> = {};
  for (const lang of ['c', 'cpp', 'java', 'python']) {
    const username = `e2e-${tag}-${lang}`;
    const user = await prisma.user.create({ data: { username, name: `E2E ${lang}`, role: 'PARTICIPANT', passwordHash, active: true } });
    const p = await prisma.participant.create({ data: { eventId: event.id, userId: user.id, enrolmentNo: username, status: 'CHECKED_IN', checkedInAt: new Date() } });
    await prisma.tokenLedger.create({ data: { eventId: event.id, participantId: p.id, kind: 'GRANT', delta: config.budget.tokensPerParticipant, idempotencyKey: `grant:${p.id}` } });
    users[lang] = username;
  }
  const admin = `e2e-${tag}-admin`;
  await prisma.user.create({ data: { username: admin, name: 'E2E Admin', role: 'ADMIN', passwordHash, active: true } });
  await prisma.$disconnect();
  writeFileSync(new URL('./.state.json', import.meta.url), JSON.stringify({ password, users, admin, eventId: event.id }));
}
