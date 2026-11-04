// A repeatable test event for pre-event checks (WP-08), on any CodeHaunt database (the live one too): slug `test-…`,
// the two demo problems, N checked-in participants with one shared password shown once, and their token grants, in one
// transaction. Remove it with delete-test-event.ts.
//   node --env-file=.env --experimental-strip-types scripts/seed-test-event.ts [--slug test-x] [--participants N] [--running]
import { createPrismaClient } from '@codehaunt/db';
import { generatePassword, hashPassword } from '@codehaunt/auth';
import { EventConfig, ProblemInput } from '@codehaunt/contracts';

// Simple argv parsing
const args = process.argv.slice(2);
let slugArg: string | undefined;
let participantsArg = '3';
let running = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--slug' && i + 1 < args.length) {
    slugArg = args[++i];
  } else if (a === '--participants' && i + 1 < args.length) {
    participantsArg = args[++i]!;
  } else if (a === '--running') {
    running = true;
  } else {
    console.error(`seed-test-event: unknown argument ${a}`);
    process.exit(1);
  }
}

const now = new Date();
const slug = slugArg ?? `test-${Date.now().toString(36)}`;
if (!/^test-[a-z0-9-]{1,32}$/.test(slug)) {
  console.error('seed-test-event: slug must match /^test-[a-z0-9-]{1,32}$/');
  process.exit(1);
}

const participantsCount = Number(participantsArg);
if (!Number.isInteger(participantsCount) || participantsCount < 1 || participantsCount > 60) {
  console.error('seed-test-event: participants must be an integer between 1 and 60');
  process.exit(1);
}

const prisma = createPrismaClient();

(async () => {
  try {
    const existing = await prisma.event.findUnique({ where: { slug } });
    if (existing) {
      console.error(`seed-test-event: event with slug ${slug} already exists`);
      process.exitCode = 1;
      return;
    }

    const password = generatePassword(16);
    const passwordHash = await hashPassword(password);

    const checkInAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const startsAt = running
      ? new Date(now.getTime() - 1 * 60 * 1000).toISOString()
      : new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const configObj = {
      branding: { title: 'Test event' },
      schedule: { checkInAt, startsAt, durationMinutes: 60, freezeMinutes: 10 },
      model: { baseUrl: process.env.GATEWAY_URL ?? 'http://gateway.invalid', name: 'junior', systemPromptVersion: 'tutor-v1' },
      judge: { rubricVersion: 'v1' },
      consent: { text: 'Test event: prompts, replies and code are logged.' },
    } as const;
    const parsedConfig = EventConfig.parse(configObj);

    const sumTwo = ProblemInput.parse({
      slug: 'sum-two',
      title: 'Sum Two Numbers',
      statement: 'Read two integers and print their sum.',
      difficulty: 'EASY',
      ord: 0,
      timeLimitMs: 2000,
      memoryLimitMb: 64,
      checker: { kind: 'caseInsensitive' },
      solutions: [{ language: 'python', kind: 'REFERENCE', source: 'a,b=map(int,input().split());print(a+b)' }],
      visibleTests: [
        { input: '1 2', expectedOutput: '3' },
        { input: '-5 10', expectedOutput: '5' },
      ],
      hiddenTests: [
        { input: '0 0', expectedOutput: '0' },
        { input: '-7 -8', expectedOutput: '-15' },
        { input: '1000000000 1000000000', expectedOutput: '2000000000' },
        { input: '-1000000000 999999999', expectedOutput: '-1' },
      ],
    });

    const reverseWords = ProblemInput.parse({
      slug: 'reverse-words',
      title: 'Reverse Words',
      statement: 'Read a line and print the words in reverse order separated by a single space.',
      difficulty: 'MEDIUM',
      ord: 1,
      timeLimitMs: 3000,
      memoryLimitMb: 128,
      checker: { kind: 'caseInsensitive' },
      solutions: [
        { language: 'python', kind: 'REFERENCE', source: "import sys;print(' '.join(sys.stdin.read().strip().split()[::-1]))" },
      ],
      visibleTests: [
        { input: 'hello world', expectedOutput: 'world hello' },
        { input: 'a b c', expectedOutput: 'c b a' },
      ],
      hiddenTests: [
        { input: 'one two three four', expectedOutput: 'four three two one' },
        { input: 'single', expectedOutput: 'single' },
        { input: '  spaced   out  words ', expectedOutput: 'words out spaced' },
        { input: 'The Quick brown FOX', expectedOutput: 'FOX brown Quick The' },
      ],
    });

    const usernames: string[] = [];
    const eventId = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          slug,
          name: `Test event ${slug}`,
          status: running ? 'RUNNING' : 'CHECK_IN',
          config: parsedConfig,
          ...(running ? { lockedAt: now } : {}),
        },
      });

      // Problems
      for (const prob of [sumTwo, reverseWords]) {
        const p = await tx.problem.create({
          data: {
            eventId: event.id,
            slug: prob.slug,
            title: prob.title,
            statement: prob.statement,
            difficulty: prob.difficulty,
            ord: prob.ord,
            timeLimitMs: prob.timeLimitMs,
            memoryLimitMb: prob.memoryLimitMb,
            checker: prob.checker,
            practice: prob.practice,
            solutions: {
              create: prob.solutions.map((s) => ({
                language: s.language.toUpperCase() as 'C' | 'CPP' | 'JAVA' | 'PYTHON',
                kind: s.kind,
                source: s.source,
              })),
            },
          },
        });
        // visible
        for (let i = 0; i < prob.visibleTests.length; i++) {
          const vt = prob.visibleTests[i]!;
          await tx.testCase.create({
            data: {
              problemId: p.id,
              visibility: 'VISIBLE',
              ord: i,
              input: vt.input,
              expectedOutput: vt.expectedOutput,
            },
          });
        }
        // hidden
        for (let i = 0; i < prob.hiddenTests.length; i++) {
          const ht = prob.hiddenTests[i]!;
          await tx.testCase.create({
            data: {
              problemId: p.id,
              visibility: 'HIDDEN',
              ord: i,
              input: ht.input,
              expectedOutput: ht.expectedOutput,
            },
          });
        }
      }

      // Participants
      for (let i = 1; i <= participantsCount; i++) {
        const username = `${slug}-p${i}`;
        const user = await tx.user.create({
          data: {
            username,
            name: `Test participant ${i}`,
            role: 'PARTICIPANT',
            passwordHash,
            active: true,
          },
        });
        const participant = await tx.participant.create({
          data: {
            eventId: event.id,
            userId: user.id,
            enrolmentNo: username,
            status: 'CHECKED_IN',
            checkedInAt: now,
            seatLabel: `T${i}`,
          },
        });
        usernames.push(username);
        await tx.tokenLedger.create({
          data: {
            eventId: event.id,
            participantId: participant.id,
            kind: 'GRANT',
            delta: parsedConfig.budget.tokensPerParticipant,
            idempotencyKey: `grant:${participant.id}`,
          },
        });
      }

      return event.id;
    });
    // Printed only after the commit, so a failed run never shows a password (review of the FORGE draft).
    console.log('seed-test-event: created event');
    console.log('event id:', eventId);
    console.log('slug:', slug);
    console.log('usernames:', usernames.join(', '));
    console.log('Shown once: give it to the tester; it is not stored in clear.');
    console.log(`password: ${password}`);
    console.log('Remove it with: node --env-file=.env --experimental-strip-types scripts/delete-test-event.ts', slug);
  } catch (e) {
    console.error('seed-test-event: failed', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
