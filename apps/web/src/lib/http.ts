/** Request IDs and the one place errors become HTTP responses. */
import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import type { ApiError } from '@codehaunt/contracts';

/** Cloudflare's cf-ray when present (traced end to end), else a fresh UUID. */
export function requestIdOf(headers: Headers): string {
  const ray = headers.get('cf-ray');
  return ray && /^[\w-]{1,64}$/.test(ray) ? ray : randomUUID();
}

export function apiError(status: number, code: string, message: string, requestId: string, init?: ResponseInit) {
  const body: ApiError = { error: { code, message }, requestId };
  return NextResponse.json(body, { ...init, status, headers: { ...init?.headers, 'x-request-id': requestId } });
}

/** First hop as seen by the tunnel (Cloudflare sets cf-connecting-ip); never trusted for authorization. */
export function clientIp(headers: Headers): string | undefined {
  return headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
}
