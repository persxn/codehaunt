/**
 * Filtering proxy in front of the host Docker socket (ADR-019). The only CodeHaunt process that
 * holds the socket; the worker reaches it as DOCKER_HOST=tcp://docker-proxy:2375 on an internal
 * network. Node built-ins only: nothing third-party runs next to a root-equivalent socket.
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';

import {
  MAX_LIVE_CONTAINERS,
  Owned,
  parseRoute,
  runnerImages,
  sandboxCreateBody,
  upstreamPath,
  type Route,
} from './policy.ts';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CONNECTIONS = 256;
/** How long the daemon gets to accept an attach before the proxy gives up. */
const UPGRADE_TIMEOUT_MS = 10_000;
/**
 * `docker run -i` half-closes after sending the job (stdin done) and keeps reading the output, so
 * a client half-close is normal. This bounds how long such a stream may then stay open; far above
 * the judge's per-run wall-clock budget.
 */
const HALF_OPEN_LIMIT_MS = 10 * 60 * 1000;

export interface ProxyOptions {
  socketPath: string;
  /** The C runner image; its language siblings are allowed with it. */
  runnerImage: string;
  log?: (entry: Record<string, unknown>) => void;
}

function refuse(res: ServerResponse, status: number, message: string): void {
  // Docker's own error shape, so the CLI prints the reason.
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ message }));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createProxy(options: ProxyOptions): http.Server {
  const allowedImages = runnerImages(options.runnerImage);
  const owned = new Owned();
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));

  /** Why a route is refused, or null when it may go upstream. */
  function denial(route: Route | null): string | null {
    if (!route) return 'not an allowed Docker API call';
    if (route.kind === 'image' && !allowedImages.has(route.image)) return 'not a runner image';
    if (route.kind === 'container' && !owned.has(route.ref)) return 'not a container this proxy created';
    if (route.kind === 'create' && owned.liveCount() >= MAX_LIVE_CONTAINERS) return 'too many sandbox containers';
    return null;
  }

  const server = http.createServer((req, res) => {
    // Nothing a client sends may take the proxy down: a restart forgets owned containers (audit N3).
    handle(req, res).catch((error: Error) => {
      log({ msg: 'handler error', error: error.message });
      if (!res.headersSent) refuse(res, 500, 'codehaunt docker-proxy: internal error');
      else res.destroy();
    });
  });
  server.maxConnections = MAX_CONNECTIONS;

  // Upgraded attach streams leave the HTTP server's bookkeeping; close() must end them too.
  const attached = new Set<Duplex>();
  const closeServer = server.close.bind(server);
  server.close = (callback?: (error?: Error) => void) => {
    for (const socket of attached) socket.destroy();
    return closeServer(callback);
  };
  server.on('clientError', (_error, socket) => socket.destroy());

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const route = parseRoute(req.method ?? '', req.url ?? '');
    const reason = denial(route) ?? (route?.kind === 'container' && route.action === 'attach' ? 'attach must upgrade' : null);
    if (reason) {
      log({ msg: 'refused', method: req.method, url: req.url, reason });
      req.resume();
      return refuse(res, 403, `codehaunt docker-proxy: ${reason}`);
    }

    let body: Buffer;
    try {
      const raw = await readBody(req);
      if (route!.kind === 'create') {
        body = Buffer.from(JSON.stringify(sandboxCreateBody(JSON.parse(raw.toString('utf8')), allowedImages)));
      } else if (raw.length > 0) {
        throw new Error('unexpected request body');
      } else body = raw;
    } catch (error) {
      log({ msg: 'refused', method: req.method, url: req.url, reason: (error as Error).message });
      return refuse(res, 403, `codehaunt docker-proxy: ${(error as Error).message}`);
    }

    const upstream = http.request(
      {
        // A fresh daemon connection per request: nothing is ever reused or pipelined on it.
        agent: false,
        socketPath: options.socketPath,
        method: req.method,
        path: upstreamPath(route!),
        headers: { host: 'docker', 'content-type': 'application/json', 'content-length': body.length },
      },
      (up) => {
        if (route!.kind === 'create' && up.statusCode === 201) {
          const chunks: Buffer[] = [];
          up.on('data', (c: Buffer) => chunks.push(c));
          up.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            try {
              const id = (JSON.parse(text) as { Id?: unknown }).Id;
              if (typeof id === 'string' && /^[0-9a-f]{64}$/.test(id)) owned.add(id, route!.name);
            } catch {
              // An unparsable reply registers nothing, so every later call on it is refused.
            }
            res.writeHead(201, { 'content-type': 'application/json' }).end(text);
          });
          return;
        }
        if (route!.kind === 'container' && route!.action === 'wait') up.on('end', () => owned.done(route!.ref));
        res.writeHead(up.statusCode ?? 502, up.headers);
        // /wait answers with headers long before its body; the CLI starts the container only once it sees them.
        res.flushHeaders();
        up.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      log({ msg: 'upstream error', error: error.message });
      if (!res.headersSent) refuse(res, 502, 'codehaunt docker-proxy: Docker daemon unavailable');
      else res.destroy();
    });
    upstream.end(body);
  }

  /*
   * `docker run -i` attaches stdin/stdout over an HTTP upgrade, then speaks raw bytes. Nothing the
   * client sends is forwarded until the daemon has answered 101: before that, the daemon is still
   * parsing HTTP, and extra bytes would be read as a second, unchecked request (audit N1). After
   * 101 the bytes are the container's stdin.
   */
  server.on('upgrade', (req: IncomingMessage, client: Duplex, head: Buffer) => {
    const route = parseRoute(req.method ?? '', req.url ?? '');
    const reason = denial(route) ?? (route?.kind === 'container' && route.action === 'attach' ? null : 'only attach may upgrade');
    if (reason) {
      log({ msg: 'refused', method: req.method, url: req.url, reason });
      client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    client.pause();
    const daemon = net.connect(options.socketPath);
    attached.add(client);
    const close = () => {
      attached.delete(client);
      daemon.destroy();
      client.destroy();
    };
    client.on('close', () => daemon.destroy());
    // Either side failing or closing ends both; the daemon ending its stream (container gone) does too.
    for (const side of [daemon, client]) {
      side.on('error', close);
      side.on('close', close);
    }
    daemon.on('end', close);
    client.on('end', () => setTimeout(close, HALF_OPEN_LIMIT_MS).unref());
    daemon.setTimeout(UPGRADE_TIMEOUT_MS, () => {
      log({ msg: 'refused', url: req.url, reason: 'daemon did not accept attach in time' });
      close();
    });

    let reply = Buffer.alloc(0);
    const onReply = (chunk: Buffer) => {
      reply = Buffer.concat([reply, chunk]);
      const end = reply.indexOf('\r\n\r\n');
      if (end < 0) {
        if (reply.length > 16 * 1024) close();
        return;
      }
      daemon.off('data', onReply);
      daemon.setTimeout(0);
      if (!/^HTTP\/1\.1 101 /.test(reply.subarray(0, 16).toString('latin1'))) {
        log({ msg: 'refused', url: req.url, reason: 'daemon did not upgrade', status: reply.subarray(0, 12).toString('latin1') });
        client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        daemon.destroy();
        return;
      }
      client.write(reply); // the 101 head plus any stream bytes already received
      if (head.length > 0) daemon.write(head);
      daemon.pipe(client);
      client.pipe(daemon);
      client.resume();
    };
    daemon.on('data', onReply);
    daemon.write(
      `POST ${upstreamPath(route!)} HTTP/1.1\r\nHost: docker\r\nContent-Length: 0\r\n` +
        'Connection: Upgrade\r\nUpgrade: tcp\r\n\r\n',
    );
  });

  return server;
}
