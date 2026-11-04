/**
 * Route access policy: deny by default, an explicit role list per route (standards §2).
 *
 * Pure and framework-free so it is unit-tested directly and the web middleware is a thin
 * caller. Imported via `@codehaunt/auth/policy`, which pulls in no Node-only modules.
 */

export type Role = 'ADMIN' | 'ORGANIZER' | 'VOLUNTEER' | 'PARTICIPANT';

export const ROLES: readonly Role[] = ['ADMIN', 'ORGANIZER', 'VOLUNTEER', 'PARTICIPANT'];

type Access = 'public' | readonly Role[];

const STAFF: readonly Role[] = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'];

/**
 * Path prefix → who may use it. A prefix matches itself and anything under it at a
 * segment boundary; the longest match wins. A path matching nothing is denied.
 * Later WPs add rows here; nothing becomes reachable by being forgotten.
 */
export const ROUTE_POLICY: ReadonlyArray<readonly [prefix: string, access: Access]> = [
  ['/login', 'public'],
  ['/api/auth/login', 'public'],
  ['/healthz', 'public'],
  ['/readyz', 'public'],
  // Shared with participants two days before the event (ADR-007): latency and browser check, no data.
  ['/system-check', 'public'],
  // Next.js build assets: hashed, contain no data.
  ['/_next/static', 'public'],
  // Projector (ADR-008, ADR-028): no login; the unguessable token in the path is the key. Rank, name, solved only.
  ['/projector', 'public'],
  ['/api/projector', 'public'],
  ['/favicon.ico', 'public'],
  // Public event page (ADR-029); signed-in visitors are redirected to their own area by the page itself.
  ['/', 'public'],
  // App icon and link-preview image (Next file conventions in src/app).
  ['/icon.png', 'public'],
  ['/opengraph-image.jpg', 'public'],
  // SEB config for the login page's sebs:// link (ADR-039): every participant receives it anyway; no data.
  ['/CodeHaunt.seb', 'public'],

  ['/api/auth/logout', ROLES],
  ['/api/auth/me', ROLES],
  ['/api/account', ROLES],
  ['/account', ROLES],

  ['/contest', ['PARTICIPANT']],
  ['/api/contest', ['PARTICIPANT']],

  // Admin console (WP-04). Volunteers reach only the desk and check-in pages (ADR-013).
  ['/admin', ['ADMIN', 'ORGANIZER']],
  ['/admin/checkin', STAFF],
  ['/admin/desk', STAFF],
  ['/admin/event', ['ADMIN']],
  ['/admin/problems', ['ADMIN']],
  ['/api/admin', ['ADMIN', 'ORGANIZER']],
  // Event editor and role changes: admin only.
  ['/api/admin/events', ['ADMIN']],
  ['/api/admin/problems', ['ADMIN']],
  ['/api/admin/roles', ['ADMIN']],
  ['/api/staff', STAFF],
];

export type Decision = { allow: true } | { allow: false; status: 401 | 403 };

/** Exact match, or `prefix/...`. `/` matches only itself, not every path. */
function matches(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function accessFor(pathname: string): Access | null {
  let best: readonly [string, Access] | null = null;
  for (const row of ROUTE_POLICY) {
    if (matches(pathname, row[0]) && (!best || row[0].length > best[0].length)) best = row;
  }
  return best ? best[1] : null;
}

/**
 * 401 when a non-public route has no valid session; 403 when the session's role is not
 * listed, or the route is not in the policy at all. Callers must pass an already
 * normalised pathname (no `..`, no encoded slashes); anything odd is denied.
 */
export function authorize(pathname: string, role: Role | null): Decision {
  if (!pathname.startsWith('/') || pathname.includes('..') || /%2f|%5c|\\/i.test(pathname)) {
    return { allow: false, status: role ? 403 : 401 };
  }
  const access = accessFor(pathname);
  if (access === 'public') return { allow: true };
  if (!role) return { allow: false, status: 401 };
  if (access && access.includes(role)) return { allow: true };
  return { allow: false, status: 403 };
}
