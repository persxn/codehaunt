import { ProblemInput } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { createProblem, listProblems } from '@/server/problem-admin-service';

type P = { id: string };

export const GET = route<P>(['ADMIN'], async ({ params }) => ({ problems: await listProblems(getPrismaClient(), params.id) }));

export const POST = route<P>(['ADMIN'], async ({ request, user, requestId, params }) =>
  createProblem(getPrismaClient(), params.id, await body(request, ProblemInput), { id: user.id, requestId }));
