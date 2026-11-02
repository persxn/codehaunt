/**
 * The public lane.
 *
 * What is being tested is not that the queue counts, which `load.test.ts`
 * already covers, but the one property the class depends on: a flood of public
 * work cannot take the machine away from the cohort. Every refusal case opens
 * with a control that proves the same call succeeds when there is room — a
 * queue that refused everything would otherwise satisfy all of them.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { JudgeQueue, JudgeAdmissionError } from '../src/queue.ts';

/** A task that blocks until it is told to finish. */
function gate() {
  let open!: () => void;
  const done = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, task: () => done };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('the lane split', () => {
  test('a public task runs when the machine is idle — the control', async () => {
    const queue = new JudgeQueue({ concurrency: 6 });
    assert.equal(await queue.run(async () => 'ran', 'public'), 'ran');
  });

  test('public work is capped at a third of the machine', async () => {
    const queue = new JudgeQueue({ concurrency: 6 });
    assert.equal(queue.publicConcurrency, 2);

    const gates = Array.from({ length: 5 }, gate);
    for (const g of gates) void queue.run(g.task, 'public');
    await tick();

    // Five public tasks offered, two running: the other three are waiting even
    // though four of the six slots are free.
    assert.equal(queue.runningPublic, 2);
    assert.equal(queue.running, 2);

    for (const g of gates) g.open();
  });

  test('the cohort still gets the whole machine while public work waits', async () => {
    const queue = new JudgeQueue({ concurrency: 6 });

    const publicGates = Array.from({ length: 4 }, gate);
    for (const g of publicGates) void queue.run(g.task, 'public');
    await tick();
    assert.equal(queue.runningPublic, 2);

    // Four cohort tasks arriving second still start immediately, because the
    // four slots the public lane may not touch were never in contention.
    const cohortGates = Array.from({ length: 4 }, gate);
    for (const g of cohortGates) void queue.run(g.task, 'cohort');
    await tick();

    assert.equal(queue.running, 6, 'the machine should be full');
    assert.equal(queue.runningPublic, 2, 'public work must not have grown');

    for (const g of [...publicGates, ...cohortGates]) g.open();
  });

  test('a machine with one slot still has a public lane of one, not zero', () => {
    // Math.floor(1/3) is 0, and a lane of zero is the feature switched off by
    // arithmetic rather than by anybody's decision.
    assert.equal(new JudgeQueue({ concurrency: 1 }).publicConcurrency, 1);
    assert.equal(new JudgeQueue({ concurrency: 2 }).publicConcurrency, 1);
  });
});

describe('cohort waiters are drained first', () => {
  test('a cohort task queued behind public work takes the next free slot', async () => {
    const queue = new JudgeQueue({ concurrency: 2, publicConcurrency: 2 });

    const running = Array.from({ length: 2 }, gate);
    for (const g of running) void queue.run(g.task, 'public');
    await tick();
    assert.equal(queue.running, 2);

    // A public waiter arrives first, then a cohort one.
    const publicWaiter = gate();
    let publicStarted = false;
    void queue.run(async () => {
      publicStarted = true;
      return publicWaiter.task();
    }, 'public');

    const cohortWaiter = gate();
    let cohortStarted = false;
    void queue.run(async () => {
      cohortStarted = true;
      return cohortWaiter.task();
    }, 'cohort');

    await tick();
    assert.equal(publicStarted, false);
    assert.equal(cohortStarted, false);

    // One slot frees. The cohort task goes, despite having queued later.
    running[0]!.open();
    await tick();
    await tick();

    assert.equal(cohortStarted, true, 'the cohort waiter should have been woken');
    assert.equal(publicStarted, false, 'the public waiter should still be waiting');

    running[1]!.open();
    cohortWaiter.open();
    publicWaiter.open();
  });
});

describe('admission control', () => {
  test('a public task queues rather than bouncing while there is depth — the control', async () => {
    const queue = new JudgeQueue({ concurrency: 3, publicConcurrency: 1, publicQueueLimit: 3 });
    const gates = Array.from({ length: 3 }, gate);
    // One runs, two wait, and none of them is refused.
    const promises = gates.map((g) => queue.run(g.task, 'public'));
    await tick();
    assert.equal(queue.queuedPublic, 2);
    for (const g of gates) g.open();
    await Promise.all(promises);
  });

  test('past the depth limit the visitor is refused now, not made to wait', async () => {
    const queue = new JudgeQueue({ concurrency: 3, publicConcurrency: 1, publicQueueLimit: 2 });
    const gates = Array.from({ length: 3 }, gate);
    const held = gates.map((g) => queue.run(g.task, 'public'));
    await tick();
    assert.equal(queue.queuedPublic, 2);

    await assert.rejects(
      () => queue.run(async () => 'nope', 'public'),
      (error: unknown) => {
        assert.ok(error instanceof JudgeAdmissionError);
        assert.ok(error.retryAfterSeconds > 0, 'a refusal must say when to come back');
        return true;
      },
    );

    for (const g of gates) g.open();
    await Promise.all(held);
  });

  test('cohort work is never refused, however deep the queue', async () => {
    // The asymmetry that matters: a student's submission waits, because
    // dropping it loses work they cannot get back.
    const queue = new JudgeQueue({ concurrency: 1, publicConcurrency: 1, publicQueueLimit: 1 });
    const blocker = gate();
    void queue.run(blocker.task, 'cohort');
    await tick();

    const gates = Array.from({ length: 20 }, gate);
    const promises = gates.map((g) => queue.run(g.task, 'cohort'));
    await tick();
    assert.equal(queue.queued, 20);

    blocker.open();
    for (const g of gates) g.open();
    await Promise.all(promises);
  });

  test('hasRoomFor answers without spending a slot', async () => {
    const queue = new JudgeQueue({ concurrency: 3, publicConcurrency: 1, publicQueueLimit: 1 });
    assert.equal(queue.hasRoomFor('public'), true);
    assert.equal(queue.hasRoomFor('cohort'), true);

    const gates = Array.from({ length: 2 }, gate);
    const held = gates.map((g) => queue.run(g.task, 'public'));
    await tick();

    assert.equal(queue.hasRoomFor('public'), false);
    assert.equal(queue.hasRoomFor('cohort'), true, 'cohort work is always admitted');

    for (const g of gates) g.open();
    await Promise.all(held);
  });
});

describe('the existing contract is unchanged', () => {
  test('run defaults to the cohort lane', async () => {
    const queue = new JudgeQueue({ concurrency: 2 });
    const gates = Array.from({ length: 2 }, gate);
    const held = gates.map((g) => queue.run(g.task));
    await tick();
    // Both running: nothing was capped, because nothing asked for the public lane.
    assert.equal(queue.running, 2);
    assert.equal(queue.runningPublic, 0);
    for (const g of gates) g.open();
    await Promise.all(held);
  });

  test('the ceiling still holds', async () => {
    const queue = new JudgeQueue({ concurrency: 4 });
    let peak = 0;
    let live = 0;
    await queue.runAll(
      Array.from({ length: 40 }, () => async () => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((resolve) => setTimeout(resolve, 1));
        live--;
      }),
    );
    assert.equal(peak, 4);
  });
});
