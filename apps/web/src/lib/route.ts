/**
 * The one wrapper every API route handler goes through (WP-03): resolves the session, checks the route's roles
 * (the middleware is the outer wall; this is the inner one), parses JSON bodies with zod, and turns every error into
 * the `ApiError` envelope with the request ID. Unknown errors are logged and answered as a bare 500 envelope.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

import { resolveSession, SESSION_COOKIE, type Role, type SessionUser } from '@codehaunt/auth';
import { BudgetExhausted, getPrismaClient } from '@codehaunt/db';

import { AppError, badRequest } from '../server/errors.ts';
import { apiError, requestIdOf } from './http.ts';

/** The only API routes a user who must change the event default password may call (ADR-041). */
export const PASSWORD_CHANGE_PATHS: ReadonlySet<string> = new Set(['/api/account/password', '/api/auth/logout', '/api/auth/me']);

export interface RouteContext<P> {
  request: NextRequest;
  user: SessionUser;
  sessionToken: string;
  requestId: string;
  params: P;
}

type Handler<P> = (ctx: RouteContext<P>) => Promise<Response | object>;

export function route<P extends Record<string, string> = Record<string, never>>(roles: readonly Role[], handler: Handler<P>) {
  return async (request: NextRequest, segment: { params: Promise<P> }): Promise<Response> => {
    const requestId = requestIdOf(request.headers);
    try {
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      const session = token ? await resolveSession(getPrismaClient(), token) : null;
      if (!session || !token) return apiError(401, 'unauthenticated', 'Sign in first.', requestId);
      if (!roles.includes(session.user.role)) return apiError(403, 'forbidden', 'Not allowed.', requestId);
      // ADR-041: still on the event's default password: nothing but changing it (and signing out) until then.
      if (session.user.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(request.nextUrl.pathname)) {
        return apiError(403, 'password_change_required', 'Choose your own password first.', requestId);
      }
      const params = await segment.params;
      const result = await handler({ request, user: session.user, sessionToken: token, requestId, params });
      if (result instanceof Response) {
        result.headers.set('x-request-id', requestId);
        return result;
      }
      return NextResponse.json(result, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } });
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AppError) return apiError(error.status, error.code, error.message, requestId);
  if (error instanceof BudgetExhausted) return apiError(409, 'budget_exhausted', 'Your token budget is used up.', requestId);
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled route error', requestId, error: String(error) }));
  return apiError(500, 'internal', 'Something went wrong. Try again, or tell a volunteer.', requestId);
}

/** Parses the JSON body with a zod schema; a bad body is a 400 naming the first problem, not the input. */
export async function body<S extends z.ZodType>(request: NextRequest, schema: S): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(issue ? `Invalid request: ${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request.');
  }
  return parsed.data;
}
