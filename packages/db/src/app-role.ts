/**
 * The roles web and worker connect as (audit F2, N5, R4). Neither is a superuser or a table owner, so
 * neither can disable the append-only triggers, TRUNCATE, or run COPY ... TO PROGRAM. Only `migrate`
 * holds the owner (POSTGRES_USER) credentials.
 *
 * Every table is classified in TABLE_ACCESS. Re-applied after every `migrate deploy`; a table that is
 * not classified gets no grants at all, and test/app-role.test.ts fails until someone decides.
 */

export const WEB_ROLE = 'codehaunt_web';
export const WORKER_ROLE = 'codehaunt_worker';
/** Replaced by the two roles above; dropped on the next provisioning run. */
const LEGACY_ROLE = 'codehaunt_app';

/** none · read · append (read + insert; ledgers) · update (append + update, no delete) · write (everything). */
export type Access = 'none' | 'read' | 'append' | 'update' | 'write';

/**
 * Who may do what, per table. web serves participants and the admin console, so it edits problems,
 * hidden tests and accounts: participant routes must still never return hidden tests (WP-03 payload
 * scan) and role changes go only through audited admin routes (WP-04). The worker judges: it reads
 * what it needs, never accounts or sessions, and writes only judging results. WP-03/05/07 adjust this.
 */
export const TABLE_ACCESS: Readonly<Record<string, { web: Access; worker: Access }>> = {
  users: { web: 'write', worker: 'none' },
  auth_sessions: { web: 'write', worker: 'none' },
  events: { web: 'write', worker: 'read' },
  problems: { web: 'write', worker: 'read' },
  test_cases: { web: 'write', worker: 'read' },
  // Organizer-only solutions; the worker runs them for calibration.
  reference_solutions: { web: 'write', worker: 'read' },
  calibration_runs: { web: 'write', worker: 'update' },
  participants: { web: 'write', worker: 'read' },
  chat_sessions: { web: 'write', worker: 'read' },
  prompt_turns: { web: 'write', worker: 'read' },
  code_versions: { web: 'write', worker: 'read' },
  submissions: { web: 'write', worker: 'update' },
  verdicts: { web: 'write', worker: 'update' },
  judge_reviews: { web: 'write', worker: 'update' },
  score_overrides: { web: 'write', worker: 'read' },
  // The worker opens judge incidents (ADR-021); staff resolve them in the web (never delete).
  incidents: { web: 'update', worker: 'append' },
  // Ledgers: append-only for everyone; the triggers are the second wall, these grants the first.
  token_ledger: { web: 'append', worker: 'read' },
  audit_log: { web: 'append', worker: 'append' },
};

const PRIVILEGES: Record<Access, string | null> = {
  none: null,
  read: 'SELECT',
  append: 'SELECT, INSERT',
  update: 'SELECT, INSERT, UPDATE',
  write: 'SELECT, INSERT, UPDATE, DELETE',
};

const PASSWORD_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const IDENT_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export interface RolePasswords {
  web: string;
  worker: string;
}

function checkPassword(name: string, password: string): void {
  if (!PASSWORD_PATTERN.test(password)) {
    throw new Error(`${name} must be 16-128 characters of [A-Za-z0-9_-] (openssl rand -hex 16)`);
  }
}

function loginRole(role: string, password: string, database: string): string[] {
  const attrs = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT';
  return [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role}; END IF;
     END $$`,
    `ALTER ROLE ${role} ${attrs} PASSWORD '${password}'`,
    `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
  ];
}

/**
 * SQL that creates or updates both roles. Passwords are interpolated (ALTER ROLE takes no bind
 * parameters), so they are restricted to a charset that needs no quoting.
 */
export function appRoleStatements(passwords: RolePasswords, database: string): string[] {
  checkPassword('WEB_DB_PASSWORD', passwords.web);
  checkPassword('WORKER_DB_PASSWORD', passwords.worker);
  if (passwords.web === passwords.worker) throw new Error('WEB_DB_PASSWORD and WORKER_DB_PASSWORD must differ');
  if (!IDENT_PATTERN.test(database)) throw new Error(`unexpected database name: ${database}`);
  const grants = Object.entries(TABLE_ACCESS).flatMap(([table, access]) =>
    (
      [
        [WEB_ROLE, access.web],
        [WORKER_ROLE, access.worker],
      ] as const
    )
      .filter(([, level]) => PRIVILEGES[level])
      .map(([role, level]) => `GRANT ${PRIVILEGES[level]} ON TABLE ${table} TO ${role}`),
  );
  return [
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LEGACY_ROLE}') THEN
         DROP OWNED BY ${LEGACY_ROLE}; DROP ROLE ${LEGACY_ROLE};
       END IF;
     END $$`,

    ...loginRole(WEB_ROLE, passwords.web, database),
    ...loginRole(WORKER_ROLE, passwords.worker, database),
    // Start from nothing (this also drops grants a table lost since the last deploy), then grant per table.
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${WEB_ROLE}, ${WORKER_ROLE}`,
    ...grants,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${WEB_ROLE}, ${WORKER_ROLE}`,
  ];
}
