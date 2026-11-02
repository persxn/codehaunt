import { ProblemInput } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { deleteProblem, getProblem, updateProblem } from '@/server/problem-admin-service';

type P = { id: string };

/** Includes hidden tests and solutions: admin only, never reachable from a participant route. */
export const GET = route<P>(['ADMIN'], async ({ params }) => getProblem(getPrismaClient(), params.id));

export const PUT = route<P>(['ADMIN'], async ({ request, user, requestId, params }) =>
  updateProblem(getPrismaClient(), params.id, await body(request, ProblemInput), { id: user.id, requestId }));

export const DELETE = route<P>(['ADMIN'], async ({ user, requestId, params }) =>
  deleteProblem(getPrismaClient(), params.id, { id: user.id, requestId }));
