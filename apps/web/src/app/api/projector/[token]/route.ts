import { NextResponse, type NextRequest } from 'next/server';

import { getPrismaClient } from '@codehaunt/db';

import { requestIdOf } from '@/lib/http';
import { errorResponse } from '@/lib/route';
import { projectorView } from '@/server/leaderboard-service';

/** Public (ADR-008): no session; the unguessable token in the path is the only key. Rank, name, solved only. */
export async function GET(request: NextRequest, segment: { params: Promise<{ token: string }> }): Promise<Response> {
  const requestId = requestIdOf(request.headers);
  try {
    const { token } = await segment.params;
    const view = await projectorView(getPrismaClient(), token);
    return NextResponse.json(view, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
