/**
 * Submission concurrency limiter.
 *
 * When a graded test closes, sixty students submit within the same minute. Each
 * submission compiles and then runs every test case, so letting them all start
 * at once would oversubscribe the CPU and inflate execution times — and a
 * student whose correct solution is judged TLE because the box was busy has
 * been failed by the judge, not by their code.
 *
 * Bounded concurrency keeps per-submission timings comparable regardless of how
 * many students are waiting. Submissions queue; they do not compete.
 *
 * ── Why there are lanes ───────────────────────────────────────────────────
 *
 * Bounded concurrency is fair between everybody already in the queue, and that
 * is exactly the problem once anonymous visitors can reach the judge. A flood
 * of public work does not break the sandbox and does not oversubscribe the CPU
 * — the ceiling holds — it simply gets *in front of the class*. Sixty students
 * submitting at the end of a test would wait behind however many strangers
 * arrived first, and every one of them would be judged correctly, slowly, which
 * is the same outcome as an outage from where the class is sitting.
 *
 * So the public lane is capped rather than queued: it may occupy at most
 * `publicConcurrency` of the slots, cohort work is never behind more than that
 * much public work, and cohort waiters are drained first when a slot frees. A
 * flood therefore costs the class a bounded fraction of the machine instead of
 * all of it.
 *
 * The second half is admission control, and it is the half a queue alone
 * cannot give. An unbounded public queue converts a flood into unbounded
 * latency and unbounded memory; the honest answer to "the public lane is
 * already full and this is the four-hundredth waiter" is to refuse now, so the
 * visitor is told to come back rather than left holding a request that will
 * time out anyway.
 */

/** Which lane a task runs in. Cohort work is the default everywhere. */
export type JudgeLane = 'cohort' | 'public';

/**
 * Thrown when the public lane is full and refusing is better than queueing.
 *
 * Never thrown for cohort work: a student's submission waits, however busy the
 * machine is, because dropping it would lose work they cannot get back.
 */
export class JudgeAdmissionError extends Error {
  readonly lane: JudgeLane = 'public';
  /** Roughly how long until the lane has room, for a message worth reading. */
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('The public judge queue is full. Try again shortly.');
    this.name = 'JudgeAdmissionError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface JudgeQueueOptions {
  /** Simultaneous sandbox invocations. Defaults to cores - 1, minimum 1. */
  concurrency?: number;
  /**
   * The most of those the public lane may hold at once.
   *
   * A third by default, rounded down, minimum one. A third rather than a half
   * because the class is the product and the public surface is the shop
   * window; minimum one because a cap of zero would not be a lane, it would be
   * the feature switched off, and there is already a switch for that.
   */
  publicConcurrency?: number;
  /**
   * Public tasks that may be *waiting* before further ones are refused.
   *
   * Four deep per public slot by default: enough that a small burst queues
   * rather than bouncing, short enough that the last person admitted is waiting
   * seconds rather than minutes.
   */
  publicQueueLimit?: number;
}

interface Waiter {
  resume: () => void;
  lane: JudgeLane;
}

export class JudgeQueue {
  readonly concurrency: number;
  readonly publicConcurrency: number;
  readonly publicQueueLimit: number;

  private active = 0;
  private activePublic = 0;
  private readonly waiting: Waiter[] = [];

  constructor(options: JudgeQueueOptions = {}) {
    const cores = (globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator
      ?.hardwareConcurrency;
    this.concurrency = Math.max(1, options.concurrency ?? (cores ? cores - 1 : 3));
    // Math.max last, so a machine with one or two slots still has a public
    // lane of exactly one rather than zero.
    this.publicConcurrency = Math.max(
      1,
      Math.min(this.concurrency, options.publicConcurrency ?? Math.floor(this.concurrency / 3)),
    );
    this.publicQueueLimit = Math.max(1, options.publicQueueLimit ?? this.publicConcurrency * 4);
  }

  /** Number of tasks currently executing. */
  get running(): number {
    return this.active;
  }

  /** Number of tasks admitted but not yet started. */
  get queued(): number {
    return this.waiting.length;
  }

  /** Public tasks currently executing. Never more than `publicConcurrency`. */
  get runningPublic(): number {
    return this.activePublic;
  }

  /** Public tasks admitted but not yet started. */
  get queuedPublic(): number {
    return this.waiting.filter((w) => w.lane === 'public').length;
  }

  /**
   * Whether a task in this lane could start or queue right now.
   *
   * Exposed so a route can answer "are we accepting public work" without
   * holding a slot to find out — the observability §17 asks for, and the same
   * question the health check wants.
   */
  hasRoomFor(lane: JudgeLane): boolean {
    if (lane === 'cohort') return true;
    return this.queuedPublic < this.publicQueueLimit;
  }

  private canStart(lane: JudgeLane): boolean {
    if (this.active >= this.concurrency) return false;
    if (lane === 'public' && this.activePublic >= this.publicConcurrency) return false;
    return true;
  }

  /**
   * Wake whoever should go next.
   *
   * Cohort waiters first, always. A public waiter is only offered the slot when
   * no cohort work wants it, which is what makes the reservation real rather
   * than a hope about arrival order.
   */
  private release(): void {
    const index = this.waiting.findIndex((w) => w.lane === 'cohort' && this.canStart('cohort'));
    if (index !== -1) {
      this.waiting.splice(index, 1)[0]!.resume();
      return;
    }
    const publicIndex = this.waiting.findIndex((w) => w.lane === 'public' && this.canStart('public'));
    if (publicIndex !== -1) this.waiting.splice(publicIndex, 1)[0]!.resume();
  }

  async run<T>(task: () => Promise<T>, lane: JudgeLane = 'cohort'): Promise<T> {
    if (lane === 'public' && !this.hasRoomFor('public')) {
      // Refused before waiting, not after. See the note on admission control.
      throw new JudgeAdmissionError(Math.max(1, this.queuedPublic));
    }

    // A loop rather than a single check: waking a waiter only *offers* it the
    // slot. Between the `active--` below and that waiter resuming — a microtask
    // later — a fresh caller can arrive, see room, and take the slot for itself,
    // and the waiter would then have pushed `active` past the ceiling. Since
    // the whole point of this class is that timings stay comparable no matter
    // how many students submit at once, and TLE is decided on wall clock, an
    // over-subscribed slot is a wrong verdict rather than an untidy counter.
    while (!this.canStart(lane)) {
      await new Promise<void>((resume) => this.waiting.push({ resume, lane }));
    }

    this.active++;
    if (lane === 'public') this.activePublic++;
    try {
      return await task();
    } finally {
      this.active--;
      if (lane === 'public') this.activePublic--;
      // Release exactly one waiter, keeping `active` at the ceiling rather than
      // letting a burst of completions admit more than `concurrency` at once.
      this.release();
    }
  }

  /** Convenience wrapper for judging a batch under the same limit. */
  async runAll<T>(tasks: (() => Promise<T>)[], lane: JudgeLane = 'cohort'): Promise<T[]> {
    return Promise.all(tasks.map((task) => this.run(task, lane)));
  }
}
