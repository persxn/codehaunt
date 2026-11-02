/**
 * Deny-by-default gate in front of every route (standards §2, policy in @codehaunt/auth/policy).
 *
 * Runs on the Node runtime so it can resolve the session against the database: a cookie
 * merely being present proves nothing. Route handlers still check their own role; this is
 * the outer wall, not the only one.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { authorize, resolveSession, SESSION_COOKIE } from '@codehaunt/auth';
import { getPrismaClient } from '@codehaunt/db';

import { apiError, requestIdOf } from '@/lib/http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const SIGN_IN_PAGE =
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/login">' +
  '<title>Sign in</title><p><a href="/login">Sign in</a> to continue.</p>';

/** `null` for an unparsable Origin (including the literal "null"), which then never matches. */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const requestId = requestIdOf(request.headers);
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // CSRF backstop for state-changing requests: a cross-site Origin is refused outright.
  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && hostOf(origin) !== request.headers.get('host')) {
      return apiError(403, 'cross_origin', 'Cross-origin request refused.', requestId);
    }
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await resolveSession(getPrismaClient(), token) : null;
  const decision = authorize(pathname, session?.user.role ?? null);

  if (!decision.allow) {
    if (isApi || decision.status === 403) {
      const message = decision.status === 401 ? 'Sign in first.' : 'Not allowed.';
      return apiError(decision.status, decision.status === 401 ? 'unauthenticated' : 'forbidden', message, requestId);
    }
    // Pages: a real 401 (rewrite() drops the status) that sends the browser to /login.
    // Relative URL on purpose: the server's own idea of its host is not what the visitor typed.
    return new NextResponse(SIGN_IN_PAGE, {
      status: 401,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-request-id': requestId },
    });
  }

  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  runtime: 'nodejs',
  // Everything. The policy decides what is public (including /_next/static).
  matcher: '/:path*',
};
