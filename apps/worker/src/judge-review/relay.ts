/**
 * `[claude]` The judge's only way to GPT-OSS (ADR-035, audit R14-4). Runs in its own container on the host network and
 * listens on a unix socket in a volume only the judge-review container mounts. Forwards `POST /api/chat` (bounded
 * body) to Ollama on 127.0.0.1 and nothing else: no model pulls, deletes or other Ollama APIs, no other host or port.
 * The judge container itself stays on the internal `db` network.
 */
import { chmodSync, rmSync } from 'node:fs';
import { createServer, request } from 'node:http';

const SOCKET = process.env.JUDGE_RELAY_SOCKET ?? '/run/judge/ollama.sock';
const OLLAMA = new URL(process.env.JUDGE_OLLAMA_URL ?? 'http://127.0.0.1:11434');
/** Largest request accepted: the judge input budget (80k chars) with room for the rubric and a repair turn. */
export const MAX_BODY_BYTES = 1024 * 1024;

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/chat') {
    res.writeHead(403, { 'content-type': 'application/json' }).end('{"error":"only POST /api/chat"}');
    return;
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  let refused = false;
  req.on('data', (chunk: Buffer) => {
    if (refused) return;
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      // Answer once and drop the rest; writing the headers again would throw and take the relay down.
      refused = true;
      chunks.length = 0;
      res.writeHead(413, { 'content-type': 'application/json', connection: 'close' }).end('{"error":"request too large"}');
      return;
    }
    chunks.push(chunk);
  });
  req.on('error', () => {});
  req.on('end', () => {
    if (refused || res.writableEnded) return;
    const body = Buffer.concat(chunks);
    const upstream = request(
      { host: OLLAMA.hostname, port: OLLAMA.port, path: '/api/chat', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': body.length } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { 'content-type': up.headers['content-type'] ?? 'application/json' });
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end('{"error":"ollama unreachable"}');
    });
    upstream.end(body);
  });
});

rmSync(SOCKET, { force: true });
server.listen(SOCKET, () => {
  // The judge container runs as the same uid (node); nobody else mounts the volume.
  chmodSync(SOCKET, 0o600);
  log({ level: 'info', msg: 'judge relay ready', socket: SOCKET, ollama: OLLAMA.origin });
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close(() => process.exit(0)));
