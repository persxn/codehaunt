/**
 * Filtering proxy in front of the host Docker socket (ADR-019). The only CodeHaunt process that
 * holds the socket; the worker reaches it as DOCKER_HOST=tcp://docker-proxy:2375 on an internal
 * network. Node built-ins only: nothing third-party runs next to a root-equivalent socket.
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';

import { Owned, parseRoute, runnerImages, sandboxCreateBody, upstreamPath, type Route } from './policy.ts';

const MAX_BODY_BYTES = 64 * 1024;

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
    return null;
  }

  const server = http.createServer(async (req, res) => {
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
  });

  // `docker run -i` attaches stdin/stdout over an HTTP upgrade, then speaks raw bytes.
  server.on('upgrade', (req: IncomingMessage, client: Duplex, head: Buffer) => {
    const route = parseRoute(req.method ?? '', req.url ?? '');
    const reason = denial(route) ?? (route?.kind === 'container' && route.action === 'attach' ? null : 'only attach may upgrade');
    if (reason) {
      log({ msg: 'refused', method: req.method, url: req.url, reason });
      client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    const daemon = net.connect(options.socketPath, () => {
      daemon.write(
        `POST ${upstreamPath(route!)} HTTP/1.1\r\nHost: docker\r\nContent-Length: 0\r\n` +
          'Connection: Upgrade\r\nUpgrade: tcp\r\n\r\n',
      );
      if (head.length > 0) daemon.write(head);
      daemon.pipe(client);
      client.pipe(daemon);
    });
    const close = () => {
      daemon.destroy();
      client.destroy();
    };
    daemon.on('error', close);
    client.on('error', close);
  });

  return server;
}
