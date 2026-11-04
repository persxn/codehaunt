// Removes a TEST event and everything it created, including its rows in the append-only token_ledger and the test
// participants' own audit_log rows (WP-08). Security-relevant (token accounting, audit log): Claude-owned.
//
//   node --env-file=.env --experimental-strip-types scripts/delete-test-event.ts <slug>          dry run: counts only
//   node --env-file=.env --experimental-strip-types scripts/delete-test-event.ts <slug> --yes    delete
//
// Only slugs of test events (`test-`, `sebtest-`, `e2e-`, `ui-`) and at most 60 participants: never the real event.
// One transaction: the two append-only triggers are disabled only inside it (the ALTER is rolled back with it on any
// error, and the table lock blocks other ledger writes for those milliseconds). Needs the owner DATABASE_URL.
// Users are deleted only if they are participants of this event and of no other. A final audit_log row records the
// removal (no actor).
import { createPrismaClient } from '@codehaunt/db';

const TEST_SLUG = /^(test|sebtest|e2e|ui)-[a-z0-9-]{1,40}$/;
const MAX_PARTICIPANTS = 60;

const [slug, flag] = process.argv.slice(2);
if (!slug || !TEST_SLUG.test(slug) || (flag !== undefined && flag !== '--yes')) {
  console.error('usage: delete-test-event.ts <test-|sebtest-|e2e-|ui- slug> [--yes]');
  process.exit(1);
}

const prisma = createPrismaClient();
try {
  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true, name: true, status: true } });
  if (!event) {
    console.error(`no event with slug ${slug}`);
    process.exit(1);
  }
  const participants = await prisma.participant.findMany({ where: { eventId: event.id }, select: { id: true, userId: true } });
  if (participants.length > MAX_PARTICIPANTS) {
    console.error(`refused: ${participants.length} participants (> ${MAX_PARTICIPANTS}); this does not look like a test event`);
    process.exit(1);
  }
  const participantIds = participants.map((p) => p.id);
  // Participant accounts that belong to this event only (staff and shared accounts are never deleted).
  const candidates = await prisma.user.findMany({
    where: { id: { in: participants.map((p) => p.userId) }, role: 'PARTICIPANT' },
    select: { id: true, username: true, participants: { select: { eventId: true } } },
  });
  const users = candidates.filter((u) => u.participants.every((p) => p.eventId === event.id));
  const userIds = users.map((u) => u.id);

  const counts = {
    participants: participants.length,
    users: users.length,
    submissions: await prisma.submission.count({ where: { participantId: { in: participantIds } } }),
    ledgerRows: await prisma.tokenLedger.count({ where: { eventId: event.id } }),
    auditRowsByTheseUsers: await prisma.auditLog.count({ where: { actorId: { in: userIds } } }),
  };
  console.log(`${event.name} (${slug}, ${event.status.toLowerCase()}, id ${event.id})`);
  console.log(JSON.stringify(counts));
  console.log(`users: ${users.map((u) => u.username).join(', ') || '(none)'}`);
  if (flag !== '--yes') {
    console.log('dry run: nothing deleted. Add --yes to delete.');
    process.exit(0);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE token_ledger DISABLE TRIGGER token_ledger_append_only');
    await tx.$executeRawUnsafe('ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only');
    await tx.$executeRaw`DELETE FROM token_ledger WHERE "eventId" = ${event.id}`;
    // Submissions first: they RESTRICT the code versions that the event cascade removes.
    await tx.$executeRaw`DELETE FROM submissions WHERE "participantId" = ANY(${participantIds})`;
    // Cascades: problems (tests, chats, drafts, calibration), participants (chats, code, reviews, overrides,
    // incidents, judge jobs), incidents, judge jobs.
    await tx.$executeRaw`DELETE FROM events WHERE id = ${event.id}`;
    await tx.$executeRaw`DELETE FROM audit_log WHERE "actorId" = ANY(${userIds})`;
    await tx.$executeRaw`DELETE FROM users WHERE id = ANY(${userIds})`; // cascades their sessions
    await tx.$executeRawUnsafe('ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only');
    await tx.$executeRawUnsafe('ALTER TABLE token_ledger ENABLE TRIGGER token_ledger_append_only');
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'event.test_deleted',
        targetType: 'event',
        targetId: event.id,
        after: { slug, ...counts },
        reason: 'test event removed with scripts/delete-test-event.ts',
      },
    });
  });
  console.log(`deleted ${slug}`);
} finally {
  await prisma.$disconnect();
}
