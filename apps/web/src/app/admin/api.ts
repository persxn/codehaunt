/** Typed fetch helpers for the admin console. Errors carry the server's plain-language `ApiError` message. */
import type { ApiError } from '@codehaunt/contracts';

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new Error('Network problem, try again.');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const getJSON = <T>(url: string) => send<T>(url);
export const postJSON = <T>(url: string, body: unknown) => send<T>(url, json('POST', body));
export const putJSON = <T>(url: string, body: unknown) => send<T>(url, json('PUT', body));
export const patchJSON = <T>(url: string, body: unknown) => send<T>(url, json('PATCH', body));
export const deleteJSON = <T>(url: string, body?: unknown) => send<T>(url, body === undefined ? { method: 'DELETE' } : json('DELETE', body));

export type EventOption = { id: string; name: string; status: string };

/** Events this user can pick: the full list for admins, non-draft events for everyone else. */
export async function eventOptions(admin: boolean): Promise<EventOption[]> {
  return admin
    ? (await getJSON<{ events: EventOption[] }>('/api/admin/events')).events
    : (await getJSON<{ events: EventOption[] }>('/api/staff/events')).events;
}
