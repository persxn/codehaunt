import { NextResponse, type NextRequest } from 'next/server';

import { login, sessionCookieOptions, SESSION_COOKIE } from '@codehaunt/auth';
import { LoginRequest, type Me } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { apiError, clientIp, requestIdOf } from '@/lib/http';

export async function POST(request: NextRequest) {
  const requestId = requestIdOf(request.headers);
  const parsed = LoginRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'invalid_request', 'Username and password are required.', requestId);

  const result = await login(getPrismaClient(), parsed.data.username, parsed.data.password, {
    ipAddress: clientIp(request.headers),
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestId,
  });

  if (!result.ok) {
    if (result.reason === 'rate_limited') {
      return apiError(429, 'rate_limited', result.message ?? 'Too many attempts.', requestId, {
        headers: { 'retry-after': String(result.retryAfterSeconds ?? 60) },
      });
    }
    if (result.reason === 'account_inactive') {
      return apiError(403, 'account_inactive', 'Your account is not active yet. Check in at the desk first.', requestId);
    }
    return apiError(401, 'invalid_credentials', 'Wrong username or password.', requestId);
  }

  const body: Me = result.user;
  const response = NextResponse.json(body, { headers: { 'x-request-id': requestId } });
  response.cookies.set(SESSION_COOKIE, result.session.token, sessionCookieOptions());
  return response;
}
