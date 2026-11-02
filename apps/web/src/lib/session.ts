/** Server-side session lookup for route handlers and pages. */
import { cookies } from 'next/headers';

import { resolveSession, SESSION_COOKIE, type SessionUser } from '@codehaunt/auth';
import { getPrismaClient } from '@codehaunt/db';

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const resolved = await resolveSession(getPrismaClient(), token);
  return resolved?.user ?? null;
}
