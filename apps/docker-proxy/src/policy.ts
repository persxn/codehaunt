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
const MAX_MEMORY_BYTES = 4 * 1024 ** 3;
const MAX_PIDS = 256;
const MAX_NANO_CPUS = 4e9;

const VERSION = String.raw`(?:/v1\.\d{1,3})?`;
const NAME = String.raw`cjudge-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;
const REF = String.raw`[0-9a-f]{64}|${NAME}`;

export type Route =
  | { kind: 'ping' }
  | { kind: 'image'; version: string; image: string }
  | { kind: 'create'; version: string; name: string }
  | { kind: 'container'; version: string; ref: string; action: 'attach' | 'wait' | 'start' | 'kill' };

/** Method + raw URL → the one request shape it is, or null (refuse). */
export function parseRoute(method: string, rawUrl: string): Route | null {
  const url = new URL(rawUrl, 'http://docker');
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

/** The upstream path for an allowed route. Query strings are fixed here, never copied. */
export function upstreamPath(route: Route): string {
  switch (route.kind) {
    case 'ping':
      return '/_ping';
    case 'image':
      return `${route.version}/images/${encodeURIComponent(route.image)}/json`;
    case 'create':
      return `${route.version}/containers/create?name=${route.name}`;
    case 'container': {
      const query = { attach: '?stderr=1&stdin=1&stdout=1&stream=1', wait: '?condition=removed', start: '', kill: '' };
      return `${route.version}/containers/${route.ref}/${route.action}${query[route.action]}`;
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
 * Containers this proxy created, by ID and by name. Entries outlive any run (the judge's
 * wall-clock budget is well under the TTL) and are pruned so the maps stay small.
 */
export class Owned {
  private readonly byRef = new Map<string, { id: string; until: number }>();
  private readonly ttlMs: number;

  constructor(ttlMs = 30 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  add(id: string, name: string, now = Date.now()): void {
    const entry = { id, until: now + this.ttlMs };
    this.byRef.set(id, entry);
    this.byRef.set(name, entry);
  }

  has(ref: string, now = Date.now()): boolean {
    for (const [key, entry] of this.byRef) if (entry.until <= now) this.byRef.delete(key);
    return this.byRef.has(ref);
  }
}
