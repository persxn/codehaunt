import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { listDrafts } from '@/server/draft-service';

type P = { id: string };

/** GPT-OSS drafts for one problem (ADMIN only: they become hidden tests). */
export const GET = route<P>(['ADMIN'], async ({ params }) => ({ drafts: await listDrafts(getPrismaClient(), params.id) }));
