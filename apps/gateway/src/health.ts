/**
 * Active health checks: every interval, GET <node>/health. A node is drained after `failThreshold`
 * consecutive failures and back in rotation on its first success. Nodes start drained, so a fresh
 * gateway is not ready until a probe passes. The server also drains a node at once on a
 * connection failure (`markDown`); the next passing probe brings it back.
 */
import type { ModelNode } from './config.ts';
import type { Router } from './router.ts';

export interface HealthOptions {
  intervalMs: number;
  failThreshold: number;
  fetch?: typeof fetch;
}

export class HealthChecker {
  private readonly fails = new Map<string, number>();
  private timer: NodeJS.Timeout | undefined;
  private readonly router: Router;
  private readonly nodes: ModelNode[];
  private readonly opts: HealthOptions;

  constructor(router: Router, nodes: ModelNode[], opts: HealthOptions) {
    this.router = router;
    this.nodes = nodes;
    this.opts = opts;
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  markDown(node: string): void {
    this.fails.set(node, this.opts.failThreshold);
    this.router.setHealthy(node, false);
  }

  async tick(): Promise<void> {
    const doFetch = this.opts.fetch ?? fetch;
    await Promise.all(this.nodes.map(async ({ name, url }) => {
      let ok = false;
      try {
        const res = await doFetch(`${url}/health`, { signal: AbortSignal.timeout(Math.min(this.opts.intervalMs, 1_500)) });
        ok = res.ok;
        await res.body?.cancel();
      } catch {
        ok = false;
      }
      if (ok) {
        this.fails.set(name, 0);
        this.router.setHealthy(name, true);
        return;
      }
      const n = (this.fails.get(name) ?? 0) + 1;
      this.fails.set(name, n);
      if (n >= this.opts.failThreshold) this.router.setHealthy(name, false);
    }));
  }
}
