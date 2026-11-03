/** Request IDs and the one place errors become HTTP responses. */
import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { sebConfig, sebHeaderValid, SEB_HEADER } from '@codehaunt/auth';
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

/**
 * The visitor's address as Cloudflare saw it (it overwrites cf-connecting-ip at the edge). Not
 * x-forwarded-for: a client can append to that freely. Only used to throttle, never to authorize.
 */
export function clientIp(headers: Headers): string | undefined {
  return headers.get('cf-connecting-ip') ?? undefined;
}

/**
 * SEB Config Key check for this request (ADR-013 §3): `undefined` when SEB is not enforced (no
 * `SEB_CONFIG_KEY`/`PUBLIC_ORIGIN`). The hashed URL is the public origin plus the path and query as received.
 */
export function sebVerified(request: Request): boolean | undefined {
  const config = sebConfig();
  if (!config) return undefined;
  const url = new URL(request.url);
  return sebHeaderValid(config, url.pathname + url.search, request.headers.get(SEB_HEADER));
}
