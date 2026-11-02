import { NextResponse, type NextRequest } from 'next/server';

import { destroySession, SESSION_COOKIE } from '@codehaunt/auth';
import { getPrismaClient } from '@codehaunt/db';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(getPrismaClient(), token);
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
