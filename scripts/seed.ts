// Dev seed: one demo event, 2 problems, an admin and 3 participants (p1 checked in). Idempotent; refuses production.
import { createPrismaClient } from '@codehaunt/db';
import { generatePassword, hashPassword } from '@codehaunt/auth';
import { EventConfig, ProblemInput } from '@codehaunt/contracts';

if (process.env.NODE_ENV === 'production') {
    console.error('seed: refusing to run in production');
    process.exit(1);
  }

const prisma = createPrismaClient();
try {
  const existing = await prisma.event.findUnique({ where: { slug: 'demo' } });
  if (existing) {
    console.log('seed: demo event already present');
    process.exit(0);
  }

  // Never a published default: a dev seed run against the event volume must not plant a known admin login.
  const password = process.env.SEED_PASSWORD || generatePassword(16);
  if (password === 'codehaunt-dev') {
    console.error('seed: SEED_PASSWORD is the old published default; pick another or leave it unset');
    process.exit(1);
  }
  if (!process.env.SEED_PASSWORD) console.log(`seed: generated password for admin, p1, p2, p3 (shown once): ${password}`);
  const passwordHash = await hashPassword(password);

  // Helper to build ISO strings with +05:30 offset for tomorrow 09:00 and 10:00
  function isoTomorrowAt(hour: number): string {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    tomorrow.setHours(hour, 0, 0, 0);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    return `${year}-${month}-${day}T${hh}:00:00+05:30`;
  }

  const configObj = {
    branding: { title: 'CodeHaunt Demo' },
    schedule: {
      checkInAt: isoTomorrowAt(9),
      startsAt: isoTomorrowAt(10),
      durationMinutes: 180,
      freezeMinutes: 30,
    },
    budget: { tokensPerParticipant: 60000, contextTokens: 8192, contextWarnPercent: 80, maxPromptChars: 4000 },
    model: {
      baseUrl: 'http://127.0.0.1:8000/v1',
      name: 'qwen2.5-coder',
      systemPromptVersion: 'v1',
      temperature: 0.2,
      hostedAllowed: false,
    },
    judge: { rubricVersion: 'v1', model: 'gpt-oss:120b' },
    scoring: {
      weights: { correctness: 0.55, tokenEfficiency: 0.15, resourceEfficiency: 0.10, processQuality: 0.20 },
      wrongSubmissionPenalty: 50,
      decayPerMinute: 2,
    },
    leaderboard: { projectorEnabled: true },
    access: { sebRequired: true, checkInCap: 40, allowMinors: false },
    consent: { text: 'I agree that my prompts, replies and code are logged and judged.', retentionDays: 30 },
  };

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

  await prisma.$transaction(async (tx) => {
    // Admin user
    const admin = await tx.user.create({
      data: {
        username: 'admin',
        name: 'Dev Admin',
        role: 'ADMIN',
        passwordHash,
        active: true,
      },
    });

    // Event
    const event = await tx.event.create({
      data: {
        slug: 'demo',
        name: 'CodeHaunt Demo',
        status: 'CHECK_IN',
        config: parsedConfig,
      },
    });

    // Problems and test cases
    const problems: { slug: string }[] = [];
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
            create: prob.solutions.map((s) => ({ language: s.language.toUpperCase() as 'C' | 'CPP' | 'JAVA' | 'PYTHON', kind: s.kind, source: s.source })),
          },
        },
      });
      // visible tests
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
      // hidden tests
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
      problems.push(p);
    }

    // Participants
    const participantsInfo = [
      { username: 'p1', name: 'Participant One', enrolmentNo: 'DEMO001', active: true, status: 'CHECKED_IN', seatLabel: 'A1' },
      { username: 'p2', name: 'Participant Two', enrolmentNo: 'DEMO002', active: false, status: 'REGISTERED', seatLabel: null },
      { username: 'p3', name: 'Participant Three', enrolmentNo: 'DEMO003', active: false, status: 'REGISTERED', seatLabel: null },
    ] as const;

    for (const info of participantsInfo) {
      const user = await tx.user.create({
        data: {
          username: info.username,
          name: info.name,
          role: 'PARTICIPANT',
          passwordHash,
          active: info.active,
        },
      });
      const participant = await tx.participant.create({
        data: {
          eventId: event.id,
          userId: user.id,
          enrolmentNo: info.enrolmentNo,
          status: info.status,
          checkedInAt: info.status === 'CHECKED_IN' ? new Date() : null,
          seatLabel: info.seatLabel,
        },
      });
      if (info.status === 'CHECKED_IN') {
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
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        action: 'seed.demo',
        targetType: 'event',
        targetId: event.id,
        actorId: admin.id,
      },
    });

    // Summary output
    console.log('seed: created demo event');
    console.log('event id:', event.id);
    console.log('problems:', problems.map(p => p.slug).join(', '));
    console.log('logins (password from SEED_PASSWORD): admin, p1 can sign in now; p2, p3 are not checked in');
  });
} catch (error) {
  console.error('seed: failed', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
