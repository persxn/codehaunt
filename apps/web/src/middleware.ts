/**
 * Deny-by-default gate in front of every route (standards §2, policy in @codehaunt/auth/policy).
 *
 * Runs on the Node runtime so it can resolve the session against the database: a cookie
 * merely being present proves nothing. Route handlers still check their own role; this is
 * the outer wall, not the only one.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { accessFor, authorize, resolveSession, SESSION_COOKIE, type Role } from '@codehaunt/auth';
import { getPrismaClient } from '@codehaunt/db';

// Relative, not `@/`: the HTTP-level test loads this file with plain Node.
import { contentSecurityPolicy, newNonce } from './lib/csp.ts';
import { apiError, requestIdOf, sebVerified } from './lib/http.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const SIGN_IN_PAGE =
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/login">' +
  '<title>Sign in</title><p><a href="/login">Sign in</a> to continue.</p>';

const SEB_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Safe Exam Browser required</title>' +
  '<p>Open CodeHaunt in Safe Exam Browser with the event config file. Ask a volunteer if you need it.</p>';
const SEB_MESSAGE = 'Open CodeHaunt in Safe Exam Browser with the event config file.';

/**
 * Domain move (ADR-045): each domain hands out the .seb whose Start URL and URL filter name that domain, so the
 * login page's `sebs://<host>/CodeHaunt.seb` link opens SEB on the address the participant is already using.
 * Host is client-controlled, but it only picks between two public files. Remove with the old domain.
 */
const LEGACY_SEB_HOST = 'codehaunt.jojocode.in';
const LEGACY_SEB_FILE = '/CodeHaunt-jojocode.seb';

/** `null` for an unparsable Origin (including the literal "null"), which then never matches. */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Participants: every non-public request must come from SEB with the event's config (ADR-013 §3).
 * A half-set SEB config throws in sebVerified: participants are then refused, never let through unchecked.
 * Exported for the tests (they have no database to resolve a participant session).
 */
export function sebGate(request: NextRequest, role: Role | null, requestId: string): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (role !== 'PARTICIPANT' || accessFor(pathname) === 'public') return null;
  let verified: boolean | undefined;
  try {
    verified = sebVerified(request);
  } catch (error) {
    console.error(`seb: ${(error as Error).message}`);
    verified = false;
  }
  if (verified !== false) return null;
  if (pathname.startsWith('/api/')) return apiError(403, 'seb_required', SEB_MESSAGE, requestId);
  return new NextResponse(SEB_PAGE, {
    status: 403,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-request-id': requestId },
  });
}

export async function middleware(request: NextRequest) {
  const requestId = requestIdOf(request.headers);
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (pathname === '/CodeHaunt.seb' && request.headers.get('host') === LEGACY_SEB_HOST) {
    return NextResponse.rewrite(new URL(LEGACY_SEB_FILE, request.url));
  }

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

  const sebRefused = sebGate(request, session?.user.role ?? null, requestId);
  if (sebRefused) return sebRefused;

  const csp = contentSecurityPolicy(newNonce(), process.env.NODE_ENV !== 'production');
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  // On the request so Next stamps the nonce on its scripts; on the response so the browser enforces it.
  headers.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  runtime: 'nodejs',
  // Everything. The policy decides what is public (including /_next/static).
  matcher: '/:path*',
};
