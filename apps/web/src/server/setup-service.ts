/**
 * Event setup roadmap (ADR-044): seven steps whose state is derived on every read, never stored, so it can't go
 * stale. A step is "done" when its data is valid and, for the settings steps, an admin saved it from the roadmap
 * (an `event.config_updated` audit row with reason `setup:NN`). Launching = opening check-in; the server refuses
 * while any *required* condition fails (`launchBlockers`), here and in Contest ops.
 */
import { EventConfig } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { conflict, notFound } from './errors.ts';

export type StepState = 'done' | 'todo' | 'blocked';

export interface SetupStep {
  n: number;
  key: 'event' | 'schedule' | 'limits' | 'problems' | 'participants' | 'access' | 'launch';
  title: string;
  state: StepState;
  /** Short facts for the step card ("4 problems · 1 warm-up"). */
  summary: string[];
  /** `required` blocks the launch; `todo` keeps the step open (not saved yet); `warning` is advice only. */
  issues: Array<{ text: string; level: 'required' | 'todo' | 'warning' }>;
}

export interface SetupView {
  event: { id: string; slug: string; name: string; status: string; locked: boolean; hasDefaultPassword: boolean };
  steps: SetupStep[];
  done: number;
  total: number;
  canLaunch: boolean;
  launched: boolean;
}

/** Reason marker an admin's roadmap save writes into the audit row. */
export const setupReason = (n: number) => `setup:${String(n).padStart(2, '0')}`;

type Tx = Pick<PrismaClient, 'event' | 'problem' | 'participant' | 'auditLog'>;

/**
 * Hard conditions for opening check-in (shared with Contest ops): valid schedule, a contest problem with hidden
 * tests, at least one participant. Empty = ready. (The tutor's gateway comes from the server env, not the event.)
 */
export async function launchBlockers(prisma: Tx, eventId: string, now = new Date()): Promise<string[]> {
  const view = await buildSetup(prisma, eventId, now);
  return view.steps.flatMap((s) => s.issues.filter((i) => i.level === 'required').map((i) => `${String(s.n).padStart(2, '0')} ${s.title}: ${i.text}`));
}

export async function getSetup(prisma: PrismaClient, eventId: string, now = new Date()): Promise<SetupView> {
  return buildSetup(prisma, eventId, now);
}

async function buildSetup(prisma: Tx, eventId: string, now: Date): Promise<SetupView> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, slug: true, name: true, status: true, lockedAt: true, config: true, defaultPasswordHash: true },
  });
  if (!event) throw notFound('That event');
  const config = EventConfig.parse(event.config);
  const saved = new Set(
    (await prisma.auditLog.findMany({
      where: { targetType: 'event', targetId: event.id, action: 'event.config_updated', reason: { startsWith: 'setup:' } },
      select: { reason: true },
    })).map((r) => r.reason),
  );
  const draft = event.status === 'DRAFT';
  const steps: SetupStep[] = [];
  const confirm = (n: number) => (saved.has(setupReason(n)) ? [] : [{ text: 'Not saved from the roadmap yet: review and save this step.', level: 'todo' as const }]);

  // 01 Event
  steps.push(step(1, 'event', 'Create your event', [
    `${event.name} · ${event.slug}`,
    `Languages: ${config.languages.join(', ')}`,
  ], [...confirm(1)]));

  // 02 Schedule
  const checkIn = new Date(config.schedule.checkInAt);
  const start = new Date(config.schedule.startsAt);
  const schedIssues: SetupStep['issues'] = [];
  if (checkIn.getTime() > start.getTime()) schedIssues.push({ text: 'Check-in opens after the start. Move check-in earlier.', level: 'required' });
  if (config.schedule.freezeMinutes >= config.schedule.durationMinutes) {
    schedIssues.push({ text: 'The leaderboard freeze is as long as the contest. Make it shorter.', level: 'required' });
  }
  if (draft && start.getTime() <= now.getTime()) schedIssues.push({ text: 'The start time is in the past.', level: 'required' });
  steps.push(step(2, 'schedule', 'Configure schedule', [
    `Starts ${ist(start)}`,
    `${config.schedule.durationMinutes} min · freeze last ${config.schedule.freezeMinutes} min`,
  ], [...schedIssues, ...confirm(2)]));

  // 03 Limits
  const limitIssues: SetupStep['issues'] = [];
  if (config.model.systemPromptVersion !== 'tutor-v2') limitIssues.push({ text: `Tutor prompt is ${config.model.systemPromptVersion}; tutor-v2 adds the hint ladder.`, level: 'warning' });
  if (config.model.maxExampleLines > 5) limitIssues.push({ text: `Tutor examples may be ${config.model.maxExampleLines} lines; 3 is recommended (ADR-038).`, level: 'warning' });
  steps.push(step(3, 'limits', 'Configure limits', [
    `${config.budget.tokensPerParticipant.toLocaleString('en-IN')} tokens each`,
    `Check-in cap ${config.access.checkInCap} · examples ≤ ${config.model.maxExampleLines} lines`,
  ], [...limitIssues, ...confirm(3)]));

  // 04 Problems
  const problems = await prisma.problem.findMany({
    where: { eventId: event.id },
    select: { practice: true, hintsOnly: true, _count: { select: { testCases: true, solutions: true } }, testCases: { where: { visibility: 'HIDDEN' }, select: { id: true }, take: 1 } },
  });
  const contest = problems.filter((p) => !p.practice);
  const probIssues: SetupStep['issues'] = [];
  if (!contest.length) probIssues.push({ text: 'Add at least one contest problem.', level: 'required' });
  if (contest.some((p) => p.testCases.length === 0)) probIssues.push({ text: 'Every contest problem needs hidden tests.', level: 'required' });
  if (contest.some((p) => p._count.solutions === 0)) probIssues.push({ text: 'Some problems have no reference solution to calibrate with.', level: 'warning' });
  steps.push(step(4, 'problems', 'Add problems', [
    `${contest.length} contest · ${problems.length - contest.length} warm-up`,
    `${problems.filter((p) => p.hintsOnly).length} hints-only`,
  ], probIssues));

  // 05 Participants
  const counts = await prisma.participant.groupBy({ by: ['status'], where: { eventId: event.id }, _count: { _all: true } });
  const by = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const people = counts.reduce((n, c) => n + c._count._all, 0);
  steps.push(step(5, 'participants', 'Import participants', [
    `${people} imported`,
    `${by('REGISTERED') + by('CHECKED_IN')} registered · ${by('WAITLISTED')} waitlisted`,
  ], people ? [] : [{ text: 'Import the participant CSV.', level: 'required' }]));

  // 06 Access
  steps.push(step(6, 'access', 'Participant access', [
    event.defaultPasswordHash ? 'Event default password set (changed at first sign-in)' : 'Per-person passwords on the badges',
    config.access.sebRequired ? 'Safe Exam Browser required' : 'SEB not required',
  ], [
    ...(config.access.sebRequired ? [] : [{ text: 'SEB is off: participants can use any browser.', level: 'warning' as const }]),
    ...confirm(6),
  ]));

  // 07 Review & launch
  const launched = !draft;
  const required = steps.flatMap((s) => s.issues.filter((i) => i.level === 'required'));
  steps.push({
    n: 7, key: 'launch', title: 'Review & launch',
    state: launched ? 'done' : required.length ? 'blocked' : 'todo',
    summary: [launched ? `Status: ${event.status.toLowerCase().replace('_', ' ')}` : 'Opens check-in for this event'],
    issues: launched ? [] : required,
  });

  const done = steps.filter((s) => s.state === 'done').length;
  return {
    event: {
      id: event.id, slug: event.slug, name: event.name, status: event.status,
      locked: event.lockedAt !== null || !['DRAFT', 'CHECK_IN'].includes(event.status), hasDefaultPassword: event.defaultPasswordHash !== null,
    },
    steps,
    done,
    total: steps.length,
    canLaunch: draft && required.length === 0,
    launched,
  };
}

function step(n: number, key: SetupStep['key'], title: string, summary: string[], issues: SetupStep['issues']): SetupStep {
  return { n, key, title, summary, issues, state: issues.some((i) => i.level === 'required') ? 'blocked' : issues.some((i) => i.level === 'todo') ? 'todo' : 'done' };
}

/** Refuses with every blocker listed (409), for the launch button and Contest ops' "Open check-in". */
export async function assertLaunchable(prisma: Tx, eventId: string, now = new Date()): Promise<void> {
  const blockers = await launchBlockers(prisma, eventId, now);
  if (blockers.length) throw conflict('setup_incomplete', `Finish setup first: ${blockers.join(' · ')}`);
}

/** The venue's local time (UEM Kolkata), for step summaries. */
function ist(d: Date): string {
  if (Number.isNaN(d.getTime())) return 'no date set';
  return `${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} IST`;
}
