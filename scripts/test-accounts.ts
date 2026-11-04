// [claude] Attaches named participant test accounts to an existing test event (WP-10, ADR-040): creates each account if
// missing, sets the shared test password from TEST_ACCOUNT_PASSWORD, and makes it checked in (active, token grant), so
// the organisers can demo the Edge -> SEB sign-in. Only `test-`/`sebtest-` events; only usernames starting `sebtest`
// or `test-`; never touches staff accounts. Re-run it for every new test event. delete-test-event.ts removes the
// accounts once no other event uses them.
//   TEST_ACCOUNT_PASSWORD=... node --env-file=.env --experimental-strip-types scripts/test-accounts.ts <event-slug> sebtest1 sebtest2
import { createPrismaClient } from '@codehaunt/db';
import { hashPassword } from '@codehaunt/auth';
import { EventConfig } from '@codehaunt/contracts';

const [slug, ...usernames] = process.argv.slice(2).map((a) => a.trim().toLowerCase());
const password = process.env.TEST_ACCOUNT_PASSWORD ?? '';
function fail(message: string): never {
  console.error(`test-accounts: ${message}`);
  process.exit(1);
}
if (!slug || !/^(test|sebtest)-[a-z0-9-]{1,40}$/.test(slug)) fail('first argument: a test-… or sebtest-… event slug');
if (usernames.length < 1 || usernames.length > 10) fail('give 1-10 usernames');
for (const u of usernames) if (!/^(sebtest|test-)[a-z0-9._-]{0,32}$/.test(u)) fail(`username ${u}: must start with sebtest or test-`);
// ADR-040: test accounts may use a short shared password; still not empty or trivially short.
if (password.length < 8 || password.length > 200) fail('TEST_ACCOUNT_PASSWORD: 8-200 characters');

const prisma = createPrismaClient();
try {
  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true, config: true } });
  if (!event) fail(`no event with slug ${slug}`);
  const config = EventConfig.parse(event.config);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const username of usernames) {
      const existing = await tx.user.findUnique({ where: { username }, select: { id: true, role: true } });
      if (existing && existing.role !== 'PARTICIPANT') fail(`${username} is a staff account`);
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { passwordHash, active: true }, select: { id: true } })
        : await tx.user.create({
            data: { username, name: `Test account ${username}`, role: 'PARTICIPANT', passwordHash, active: true },
            select: { id: true },
          });
      const participant =
        (await tx.participant.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } }, select: { id: true } })) ??
        (await tx.participant.create({
          data: { eventId: event.id, userId: user.id, enrolmentNo: username, status: 'CHECKED_IN', checkedInAt: now, seatLabel: username },
          select: { id: true },
        }));
      await tx.participant.update({ where: { id: participant.id }, data: { status: 'CHECKED_IN', checkedInAt: now } });
      // The token ledger is append-only: grant once per participant, never update.
      const key = `grant:${participant.id}`;
      if (!(await tx.tokenLedger.findUnique({ where: { idempotencyKey: key }, select: { id: true } }))) {
        await tx.tokenLedger.create({
          data: { eventId: event.id, participantId: participant.id, kind: 'GRANT', delta: config.budget.tokensPerParticipant, idempotencyKey: key },
        });
      }
      await tx.auditLog.create({
        data: { actorId: null, action: 'user.activated', targetType: 'user', targetId: user.id, after: { active: true, via: 'scripts/test-accounts.ts', event: slug } },
      });
    }
  });
  console.log(`test-accounts: ${usernames.join(', ')} checked in to ${slug} with the shared test password`);
} catch (error) {
  console.error('test-accounts: failed', (error as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
