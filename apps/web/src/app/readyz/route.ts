/** Dependencies reachable: currently the database. */
import { getPrismaClient } from '@codehaunt/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getPrismaClient().$queryRawUnsafe('SELECT 1');
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, failing: ['database'] }, { status: 503 });
  }
}
