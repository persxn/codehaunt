/**
 * The role web and worker connect as (audit F2). Not a superuser and not the table owner, so it
 * cannot disable the append-only triggers, TRUNCATE, or run COPY ... TO PROGRAM. Only `migrate`
 * holds the owner (POSTGRES_USER) credentials.
 *
 * Re-applied after every `migrate deploy`, so tables added by later migrations are covered.
 */

export const APP_ROLE = 'codehaunt_app';

/** Insert and read only; the triggers are the second wall, these grants the first. */
export const APPEND_ONLY_TABLES = ['audit_log', 'token_ledger'] as const;

const PASSWORD_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const IDENT_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * SQL that creates or updates the app role. The password is interpolated (ALTER ROLE takes no
 * bind parameters), so it is restricted to a charset that needs no quoting.
 */
export function appRoleStatements(password: string, database: string): string[] {
  if (!PASSWORD_PATTERN.test(password)) {
    throw new Error('APP_DB_PASSWORD must be 16-128 characters of [A-Za-z0-9_-] (openssl rand -hex 16)');
  }
  if (!IDENT_PATTERN.test(database)) throw new Error(`unexpected database name: ${database}`);
  const attrs = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT';
  return [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN CREATE ROLE ${APP_ROLE}; END IF;
     END $$`,
    `ALTER ROLE ${APP_ROLE} ${attrs} PASSWORD '${password}'`,
    `GRANT CONNECT ON DATABASE ${database} TO ${APP_ROLE}`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    `DO $$ BEGIN
       IF to_regclass('_prisma_migrations') IS NOT NULL THEN REVOKE ALL ON TABLE _prisma_migrations FROM ${APP_ROLE}; END IF;
     END $$`,
    `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${APPEND_ONLY_TABLES.join(', ')} FROM ${APP_ROLE}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`,
  ];
}
