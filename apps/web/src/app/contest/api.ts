/** Typed fetch helpers for the contest screen. Errors carry the server's plain-language `ApiError` message. */
import type { ApiError, PromptRequest, PromptStreamEvent } from '@codehaunt/contracts';

const NETWORK = 'Network problem, try again.';

async function failure(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  // ADR-041: the account still has the event's default password.
  if (body?.error?.code === 'password_change_required') window.location.assign('/account?first=1');
  return new Error(body?.error?.message ?? NETWORK);
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new Error(NETWORK);
  }
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

export const getJSON = <T>(url: string) => send<T>(url);

export const postJSON = <T>(url: string, body: unknown) =>
  send<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/**
 * One prompt turn. The reply arrives as NDJSON lines (deltas, then one `done` or `error`); a replayed request answers
 * one JSON event. Always ends with exactly one `done` or `error` call, whatever happens to the connection.
 */
export async function streamPrompt(request: PromptRequest, onEvent: (event: PromptStreamEvent) => void): Promise<void> {
  let finished = false;
  const emit = (event: PromptStreamEvent) => {
    if (finished) return;
    if (event.type !== 'delta') finished = true;
    onEvent(event);
  };
  let response: Response;
  try {
    response = await fetch('/api/contest/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    emit({ type: 'error', code: 'network', message: NETWORK });
    return;
  }
  if (!response.ok) {
    const error = await failure(response);
    emit({ type: 'error', code: 'http', message: error.message });
    return;
  }
  if ((response.headers.get('content-type') ?? '').includes('application/json')) {
    emit((await response.json()) as PromptStreamEvent);
    return;
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line: string) => {
    if (!line.trim()) return;
    try {
      emit(JSON.parse(line) as PromptStreamEvent);
    } catch {
      // A torn line can only come from a broken connection; the end-of-stream check reports it.
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf('\n')) !== -1) {
        handle(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 1);
      }
    }
    handle(buffer + decoder.decode());
  } catch {
    // fall through: the connection dropped
  }
  emit({ type: 'error', code: 'interrupted', message: 'The connection dropped. Reload to see whether the reply was saved.' });
}
