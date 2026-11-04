// [claude] Creates one staff account (default ADMIN) straight in the database, for bootstrapping when nobody can sign in
// to the Staff page yet or the organisers ask for named admins (WP-10). Prints a one-time 16-character password once,
// after the commit; the person changes it at /account on first sign-in. Nothing is stored in clear.
//   node --env-file=.env --experimental-strip-types scripts/create-staff.ts --username u --name "Full Name" --email a@b.c [--role ADMIN|ORGANIZER|VOLUNTEER]
import { createPrismaClient } from '@codehaunt/db';
import { generatePassword, hashPassword } from '@codehaunt/auth';

const ROLES = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;
type StaffRole = (typeof ROLES)[number];

const opts: Record<string, string> = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i];
  const value = argv[i + 1];
  if (!key?.startsWith('--') || value === undefined) {
    console.error(`create-staff: bad argument ${key ?? ''}`);
    process.exit(1);
  }
  opts[key.slice(2)] = value;
}
const username = (opts.username ?? '').trim().toLowerCase();
const name = (opts.name ?? '').trim();
const email = (opts.email ?? '').trim().toLowerCase();
const role = (opts.role ?? 'ADMIN').toUpperCase() as StaffRole;
// Same rules as the Staff page (contracts StaffCreateRequest).
if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail('username: 3-40 of a-z 0-9 . _ -');
if (name.length < 1 || name.length > 120) fail('name: 1-120 characters');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email looks wrong');
if (!ROLES.includes(role)) fail(`role: one of ${ROLES.join(', ')}`);

function fail(message: string): never {
  console.error(`create-staff: ${message}`);
  process.exit(1);
}

const prisma = createPrismaClient();
try {
  const password = generatePassword(16);
  const passwordHash = await hashPassword(password);
  const id = await prisma.$transaction(async (tx) => {
    if (await tx.user.findFirst({ where: { OR: [{ username }, { email }] } })) fail('that username or email is already used');
    const user = await tx.user.create({ data: { username, name, email, role, passwordHash, active: true }, select: { id: true } });
    await tx.auditLog.create({
      data: { actorId: null, action: 'staff.created', targetType: 'user', targetId: user.id, after: { username, role, via: 'scripts/create-staff.ts' } },
    });
    return user.id;
  });
  console.log(`create-staff: created ${role} ${username} (${id})`);
  console.log('One-time password, shown once; change it at /account after signing in:');
  console.log(`password: ${password}`);
} catch (error) {
  console.error('create-staff: failed', (error as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
