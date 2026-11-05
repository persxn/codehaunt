import { NextResponse } from 'next/server';

import { ParticipantImportRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { importParticipants } from '@/server/participant-admin-service';

/**
 * Strict participant import (ADR-044). `dryRun: true` returns the preview and every row issue; a commit with any
 * issue answers 409 with the same issues and writes nothing.
 */
export const POST = route(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId }) => {
  const result = await importParticipants(getPrismaClient(), await body(request, ParticipantImportRequest), { id: user.id, requestId });
  if (!result.dryRun && !result.ok) return NextResponse.json(result, { status: 409, headers: { 'cache-control': 'no-store' } });
  return result;
});
