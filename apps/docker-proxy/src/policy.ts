/**
 * What the worker may ask the Docker daemon (ADR-019, audit F1). Pure: no I/O, unit-tested.
 *
 * The worker runs `docker run --rm -i ...` (vendored judge) and `docker image inspect`. That is
 * seven request shapes; everything else is refused. A create request is not checked field by
 * field: it is rebuilt from the sandbox template, taking only the image and the numeric limits
 * from the caller, so a field nobody thought of (Privileged, Binds, PidMode, Devices...) cannot
 * slip through. Calls on containers are allowed only for containers this proxy created.
 */

export const RUNNER_CMD = ['python3', '/opt/cjudge/runner.py'] as const;
const SANDBOX_TMPFS = {
  '/box': 'rw,exec,nosuid,size=64m,mode=1777',
  '/tmp': 'rw,noexec,nosuid,size=8m,mode=1777',
};
/** One sandbox's cgroup ceiling: the contract's 1 GiB run limit plus compile and runner headroom. */
const MAX_MEMORY_BYTES = 2 * 1024 ** 3;
const MAX_PIDS = 256;
const MAX_NANO_CPUS = 2e9;

const VERSION = String.raw`(?:/v1\.\d{1,3})?`;
const NAME = String.raw`cjudge-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;
const REF = String.raw`[0-9a-f]{64}|${NAME}`;

export type Route =
  | { kind: 'ping' }
  | { kind: 'image'; version: string; image: string }
  | { kind: 'create'; version: string; name: string }
  | { kind: 'container'; version: string; ref: string; action: 'attach' | 'wait' | 'start' | 'kill' };

/** Method + raw URL → the one request shape it is, or null (refuse). Never throws. */
export function parseRoute(method: string, rawUrl: string): Route | null {
  try {
    return matchRoute(method, new URL(rawUrl, 'http://docker'));
  } catch {
    return null; // malformed URL or percent-encoding (audit N3)
  }
}

function matchRoute(method: string, url: URL): Route | null {
  const path = url.pathname;
  let m: RegExpMatchArray | null;

  if ((method === 'GET' || method === 'HEAD') && new RegExp(`^${VERSION}/_ping$`).test(path)) return { kind: 'ping' };

  if (method === 'GET' && (m = path.match(new RegExp(`^(${VERSION})/images/([^/]+)/json$`)))) {
    return { kind: 'image', version: m[1]!, image: decodeURIComponent(m[2]!) };
  }
  if (method !== 'POST') return null;

  if ((m = path.match(new RegExp(`^(${VERSION})/containers/create$`)))) {
    const name = url.searchParams.get('name') ?? '';
    return new RegExp(`^${NAME}$`).test(name) ? { kind: 'create', version: m[1]!, name } : null;
  }
  if ((m = path.match(new RegExp(`^(${VERSION})/containers/(${REF})/(attach|wait|start|kill)$`)))) {
    return { kind: 'container', version: m[1]!, ref: m[2]!, action: m[3] as 'attach' | 'wait' | 'start' | 'kill' };
  }
  return null;
}

/**
 * The upstream path for an allowed route. Query strings are fixed here, never copied, and the
 * client's API version is dropped: the daemon answers an unsupported version with 400 but keeps
 * the connection open, which made the attach upgrade a smuggling channel (audit N1).
 */
export function upstreamPath(route: Route): string {
  switch (route.kind) {
    case 'ping':
      return '/_ping';
    case 'image':
      return `/images/${encodeURIComponent(route.image)}/json`;
    case 'create':
      return `/containers/create?name=${route.name}`;
    case 'container': {
      const query = { attach: '?stderr=1&stdin=1&stdout=1&stream=1', wait: '?condition=removed', start: '', kill: '' };
      return `/containers/${route.ref}/${route.action}${query[route.action]}`;
    }
  }
}

/** `codehaunt-runner:1` allows it and its `-cpp`, `-java`, `-python` siblings at the same tag. */
export function runnerImages(cImage: string): ReadonlySet<string> {
  const [name, tag = 'latest'] = cImage.split(':');
  return new Set([cImage, ...['cpp', 'java', 'python'].map((lang) => `${name}-${lang}:${tag}`)]);
}

function boundedInt(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

/** The create body sent upstream, built from the template. Throws (→ 403) on anything off-template. */
export function sandboxCreateBody(input: unknown, allowedImages: ReadonlySet<string>): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) throw new Error('body must be a JSON object');
  const body = input as Record<string, unknown>;
  const host = (body.HostConfig ?? {}) as Record<string, unknown>;

  if (typeof body.Image !== 'string' || !allowedImages.has(body.Image)) throw new Error('image is not a runner image');
  if (JSON.stringify(body.Cmd) !== JSON.stringify(RUNNER_CMD)) throw new Error('command is not the runner');
  const memory = boundedInt(host.Memory, 1, MAX_MEMORY_BYTES, 'Memory');
  if (host.MemorySwap !== memory) throw new Error('MemorySwap must equal Memory (no swap)');

  return {
    Image: body.Image,
    Cmd: [...RUNNER_CMD],
    User: '65534:65534',
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: true,
    Tty: false,
    NetworkDisabled: true,
    Labels: { 'codehaunt.sandbox': '1' },
    HostConfig: {
      NetworkMode: 'none',
      AutoRemove: true,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Tmpfs: SANDBOX_TMPFS,
      Memory: memory,
      MemorySwap: memory,
      PidsLimit: boundedInt(host.PidsLimit, 1, MAX_PIDS, 'PidsLimit'),
      NanoCpus: boundedInt(host.NanoCpus, 1, MAX_NANO_CPUS, 'NanoCpus'),
    },
  };
}

/**
 * Host protection against a compromised worker (re-audit N4, R3). The DGX has 119 GiB shared with
 * the models; sandboxes together may hold at most 24 GiB, and no more than 32 at once.
 */
export const MAX_LIVE_CONTAINERS = 32;
export const SANDBOX_MEMORY_BUDGET_BYTES = 24 * 1024 ** 3;
/** CPUs all sandboxes may claim together (Docker NanoCpus); the DGX has 20 cores (run-4). */
export const SANDBOX_CPU_BUDGET_NANOS = 16e9;
/** A reservation whose create never got an answer from the daemon is released after this (run-4 R5). */
export const RESERVATION_TIMEOUT_MS = 2 * 60 * 1000;
/**
 * Longest a sandbox may live. The judge's own worst case is 200 tests x (10 s + 0.5 s) plus compile,
 * about 36 minutes; past this the proxy removes the container itself.
 */
export const MAX_RUN_MS = 40 * 60 * 1000;

interface Entry {
  id: string;
  memory: number;
  cpus: number;
  created: number;
  live: boolean;
}

/**
 * Containers this proxy created, by ID and by name. A container counts as live (against the count
 * and memory caps) until its removal is seen or the proxy removes it. Entries are kept a little
 * past MAX_RUN_MS so late kill/wait calls on them are still recognised.
 */
export class Owned {
  private readonly byRef = new Map<string, Entry>();
  private readonly keepMs: number;

  constructor(keepMs = MAX_RUN_MS + 5 * 60 * 1000) {
    this.keepMs = keepMs;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.byRef) if (!entry.live && entry.created + this.keepMs <= now) this.byRef.delete(key);
  }

  /**
   * Claims a slot before the create goes upstream, so concurrent creates cannot all pass the caps.
   * False when it does not fit.
   */
  reserve(name: string, memory: number, cpus = 0, now = Date.now()): boolean {
    if (this.byRef.has(name) || !this.fits(memory, cpus)) return false;
    this.byRef.set(name, { id: '', memory, cpus, created: now, live: true });
    return true;
  }

  /** The daemon created it: recognise it by ID too. */
  confirm(name: string, id: string): void {
    const entry = this.byRef.get(name);
    if (!entry) return;
    entry.id = id;
    this.byRef.set(id, entry);
  }

  /** The create failed: give the slot back. */
  cancel(name: string): void {
    if (!this.byRef.get(name)?.id) this.byRef.delete(name);
  }

  add(id: string, name: string, memory: number, now = Date.now()): void {
    if (this.reserve(name, memory, 0, now)) this.confirm(name, id);
  }

  has(ref: string, now = Date.now()): boolean {
    this.prune(now);
    return this.byRef.has(ref);
  }

  idOf(ref: string): string | undefined {
    return this.byRef.get(ref)?.id;
  }

  /** The container is gone: it no longer counts against the caps. */
  done(ref: string): void {
    const entry = this.byRef.get(ref);
    if (entry) entry.live = false;
  }

  private live(): Entry[] {
    return [...new Set([...this.byRef.values()].filter((e) => e.live))];
  }

  /** Whether one more sandbox fits under the count, memory and CPU caps. */
  fits(memory: number, cpus = 0): boolean {
    const live = this.live();
    return (
      live.length < MAX_LIVE_CONTAINERS &&
      live.reduce((sum, e) => sum + e.memory, memory) <= SANDBOX_MEMORY_BUDGET_BYTES &&
      live.reduce((sum, e) => sum + e.cpus, cpus) <= SANDBOX_CPU_BUDGET_NANOS
    );
  }

  liveCount(): number {
    return this.live().length;
  }

  /** Live containers older than MAX_RUN_MS: the proxy removes these itself. */
  overdue(now = Date.now()): string[] {
    return this.live().filter((e) => e.id && now - e.created > MAX_RUN_MS).map((e) => e.id);
  }

  /** Releases reservations the daemon never answered (it crashed or hung mid-create). Returns their names. */
  releaseStale(now = Date.now()): string[] {
    const stale: string[] = [];
    for (const [key, entry] of this.byRef) {
      if (!entry.id && now - entry.created > RESERVATION_TIMEOUT_MS) {
        this.byRef.delete(key);
        stale.push(key);
      }
    }
    return stale;
  }
}
