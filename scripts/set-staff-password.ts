// [claude] Sets a staff account's password to one the organisers chose (WP-10), from NEW_PASSWORD in the environment
// (never an argument or a file). Same rules as /account (checkPasswordStrength, ADR-020); ends the account's sessions;
// audit-logged. Participants are refused: their passwords come from badges.
//   NEW_PASSWORD=... node --env-file=.env --experimental-strip-types scripts/set-staff-password.ts <username>
import { createPrismaClient } from '@codehaunt/db';
import { checkPasswordStrength, hashPassword } from '@codehaunt/auth';

const username = (process.argv[2] ?? '').trim().toLowerCase();
const password = process.env.NEW_PASSWORD ?? '';
function fail(message: string): never {
  console.error(`set-staff-password: ${message}`);
  process.exit(1);
}
if (!username) fail('give a username');
const strength = checkPasswordStrength(password, username);
if (!strength.ok) fail(strength.reason);

const prisma = createPrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, role: true } });
  if (!user || user.role === 'PARTICIPANT') fail(`no staff account ${username}`);
  const passwordHash = await hashPassword(password);
  const ended = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    const { count } = await tx.authSession.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: { actorId: null, action: 'auth.password_reset', targetType: 'user', targetId: user.id, after: { via: 'scripts/set-staff-password.ts', sessionsEnded: count } },
    });
    return count;
  });
  console.log(`set-staff-password: ${username} updated; ${ended} session(s) ended`);
} catch (error) {
  console.error('set-staff-password: failed', (error as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
