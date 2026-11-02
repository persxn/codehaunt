/**
 * Node selection (ADR-004): least-outstanding requests among healthy nodes below their slot cap,
 * soft affinity to a session's last node (prefix cache), and a bounded FIFO queue when every
 * slot is taken. No I/O: health comes in through `setHealthy`, the server calls `release`.
 */

export class RouterError extends Error {
  readonly code: 'gateway_busy' | 'no_healthy_node';
  constructor(code: 'gateway_busy' | 'no_healthy_node', message: string) {
    super(message);
    this.code = code;
  }
}

interface NodeState {
  inflight: number;
  healthy: boolean;
}

interface Waiter {
  sessionId: string;
  exclude: ReadonlySet<string>;
  resolve: (node: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** A session keeps its node unless that node has more than this many extra requests in flight. */
const AFFINITY_SLACK = 1;
const MAX_AFFINITY_ENTRIES = 10_000;

export class Router {
  readonly nodes = new Map<string, NodeState>();
  private readonly affinity = new Map<string, string>();
  private readonly queue: Waiter[] = [];
  private turn = 0;
  private readonly slotsPerNode: number;
  private readonly queueMax: number;
  private readonly queueTimeoutMs: number;

  constructor(names: string[], slotsPerNode: number, queueMax: number, queueTimeoutMs: number) {
    this.slotsPerNode = slotsPerNode;
    this.queueMax = queueMax;
    this.queueTimeoutMs = queueTimeoutMs;
    for (const name of names) this.nodes.set(name, { inflight: 0, healthy: false });
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  healthyCount(): number {
    let n = 0;
    for (const s of this.nodes.values()) if (s.healthy) n++;
    return n;
  }

  /** Resolves with a node whose slot is now held; the caller must `release` it exactly once. */
  acquire(sessionId: string, exclude: ReadonlySet<string> = new Set()): Promise<string> {
    const node = this.pick(sessionId, exclude);
    if (node) return Promise.resolve(this.take(node, sessionId));
    if (!this.anyUsable(exclude)) {
      return Promise.reject(new RouterError('no_healthy_node', 'no healthy model node'));
    }
    if (this.queue.length >= this.queueMax) {
      return Promise.reject(new RouterError('gateway_busy', 'all model slots busy and the queue is full'));
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        sessionId,
        exclude,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.drop(waiter);
          reject(new RouterError('gateway_busy', 'timed out waiting for a model slot'));
        }, this.queueTimeoutMs),
      };
      this.queue.push(waiter);
    });
  }

  release(node: string): void {
    const s = this.nodes.get(node);
    if (s && s.inflight > 0) s.inflight--;
    this.drain();
  }

  setHealthy(node: string, healthy: boolean): void {
    const s = this.nodes.get(node);
    if (!s || s.healthy === healthy) return;
    s.healthy = healthy;
    this.drain();
  }

  private take(node: string, sessionId: string): string {
    this.nodes.get(node)!.inflight++;
    this.affinity.delete(sessionId);
    this.affinity.set(sessionId, node);
    if (this.affinity.size > MAX_AFFINITY_ENTRIES) {
      this.affinity.delete(this.affinity.keys().next().value!);
    }
    return node;
  }

  private pick(sessionId: string, exclude: ReadonlySet<string>): string | undefined {
    const free: [string, NodeState][] = [];
    for (const entry of this.nodes) {
      const [name, s] = entry;
      if (s.healthy && !exclude.has(name) && s.inflight < this.slotsPerNode) free.push(entry);
    }
    if (free.length === 0) return undefined;
    const min = Math.min(...free.map(([, s]) => s.inflight));
    const preferred = this.affinity.get(sessionId);
    const sticky = free.find(([name]) => name === preferred);
    if (sticky && sticky[1].inflight <= min + AFFINITY_SLACK) return sticky[0];
    // Rotate among the least-loaded nodes so ties spread instead of piling on the first.
    const least = free.filter(([, s]) => s.inflight === min);
    return least[this.turn++ % least.length]![0];
  }

  /** True if some healthy node outside `exclude` exists, i.e. waiting can succeed. */
  private anyUsable(exclude: ReadonlySet<string>): boolean {
    for (const [name, s] of this.nodes) if (s.healthy && !exclude.has(name)) return true;
    return false;
  }

  private drain(): void {
    for (let i = 0; i < this.queue.length; ) {
      const w = this.queue[i]!;
      if (!this.anyUsable(w.exclude)) {
        this.queue.splice(i, 1);
        clearTimeout(w.timer);
        w.reject(new RouterError('no_healthy_node', 'no healthy model node'));
        continue;
      }
      const node = this.pick(w.sessionId, w.exclude);
      if (!node) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(this.take(node, w.sessionId));
    }
  }

  private drop(w: Waiter): void {
    const i = this.queue.indexOf(w);
    if (i >= 0) this.queue.splice(i, 1);
  }
}
