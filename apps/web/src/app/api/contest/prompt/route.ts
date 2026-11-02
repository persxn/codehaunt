/**
 * Streams one prompt turn as NDJSON (`PromptStreamEvent`). The model call runs to the end even if the browser
 * disconnects: writes to a closed stream are dropped, the reservation is still settled (ADR-022).
 */
import { PromptRequest, type PromptStreamEvent } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { modelClient } from '@/lib/services';
import { participantContext } from '@/server/contest';
import { startPrompt } from '@/server/prompt-service';

export const dynamic = 'force-dynamic';

export const POST = route(['PARTICIPANT'], async ({ request, user, requestId }) => {
  const input = await body(request, PromptRequest);
  const prisma = getPrismaClient();
  const ctx = await participantContext(prisma, user.id, new Date());
  const started = await startPrompt({ prisma, model: modelClient(), now: () => new Date(), requestId }, ctx, input);
  if ('replay' in started) return { type: 'done', response: started.replay } satisfies PromptStreamEvent;

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: PromptStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      void started.run(emit).finally(() => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by the client going away
        }
      });
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
});
