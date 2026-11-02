/**
 * The roles web and worker connect as (audit F2, N5). Neither is a superuser or a table owner, so
 * neither can disable the append-only triggers, TRUNCATE, or run COPY ... TO PROGRAM. Only `migrate`
 * holds the owner (POSTGRES_USER) credentials.
 *
 * Re-applied after every `migrate deploy`, so tables added by later migrations are covered: web gets
 * them read/write, worker read-only until a WP adds them to WORKER_WRITES.
 */

export const WEB_ROLE = 'codehaunt_web';
export const WORKER_ROLE = 'codehaunt_worker';
/** Replaced by the two roles above; dropped on the next provisioning run. */
const LEGACY_ROLE = 'codehaunt_app';

/** Insert and read only, for every role; the triggers are the second wall, these grants the first. */
export const APPEND_ONLY_TABLES = ['audit_log', 'token_ledger'] as const;

/** The worker never reads accounts or login sessions (password hashes, session tokens' hashes). */
const WORKER_HIDDEN = ['users', 'auth_sessions'] as const;
/** What judging writes. WP-03/05/07 extend this when they add worker jobs. */
export const WORKER_WRITES = ['submissions', 'verdicts', 'judge_reviews'] as const;

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
  const ledgers = APPEND_ONLY_TABLES.join(', ');
  return [
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LEGACY_ROLE}') THEN
         DROP OWNED BY ${LEGACY_ROLE}; DROP ROLE ${LEGACY_ROLE};
       END IF;
     END $$`,

    ...loginRole(WEB_ROLE, passwords.web, database),
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${WEB_ROLE}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${WEB_ROLE}`,

    ...loginRole(WORKER_ROLE, passwords.worker, database),
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${WORKER_ROLE}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${WORKER_ROLE}`,
    `REVOKE ALL ON TABLE ${WORKER_HIDDEN.join(', ')} FROM ${WORKER_ROLE}`,
    `GRANT INSERT, UPDATE ON TABLE ${WORKER_WRITES.join(', ')} TO ${WORKER_ROLE}`,
    `GRANT INSERT ON TABLE audit_log TO ${WORKER_ROLE}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${WORKER_ROLE}`,

    `DO $$ BEGIN
       IF to_regclass('_prisma_migrations') IS NOT NULL THEN
         REVOKE ALL ON TABLE _prisma_migrations FROM ${WEB_ROLE}, ${WORKER_ROLE};
       END IF;
     END $$`,
    `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${ledgers} FROM ${WEB_ROLE}, ${WORKER_ROLE}`,
  ];
}
