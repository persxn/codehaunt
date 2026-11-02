/**
 * Typed domain errors (standards §2). Services throw these; `lib/route.ts` maps them to the `ApiError` envelope in
 * one place. Messages are shown to people as written, so they are plain language and never carry internals.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = 'That item') => new AppError(404, 'not_found', `${what} was not found.`);
export const forbidden = (message = 'You are not allowed to do that.') => new AppError(403, 'forbidden', message);
export const badRequest = (message: string) => new AppError(400, 'invalid_request', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const contestNotRunning = (message = 'The contest is not running right now.') =>
  new AppError(409, 'contest_not_running', message);
