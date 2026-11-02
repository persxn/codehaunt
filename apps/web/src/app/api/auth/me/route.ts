import { NextResponse, type NextRequest } from 'next/server';

import type { Me } from '@codehaunt/contracts';

import { apiError, requestIdOf } from '@/lib/http';
import { currentUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return apiError(401, 'unauthenticated', 'Sign in first.', requestIdOf(request.headers));
  const body: Me = user;
  return NextResponse.json(body);
}
