/**
 * Safe Exam Browser Config Key check (ADR-013 §3).
 *
 * SEB for Windows sends `X-SafeExamBrowser-ConfigKeyHash` = SHA-256(absolute URL without fragment + Config Key),
 * hex, on every request. The URL is the one the browser asked for, so it is rebuilt from the configured public
 * origin, never from the Host header: behind the tunnel the app sees an internal origin, and Host is client-controlled.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const SEB_HEADER = 'x-safeexambrowser-configkeyhash';

export interface SebEntry {
  /** 64 hex characters, lowercase. */
  configKey: string;
  /** `https://host[:port]`, no trailing slash or path. */
  publicOrigin: string;
}

/**
 * One entry per accepted `.seb` file: the origin its Start URL uses and its Config Key (ADR-045). Two entries only
 * while the site moves domain, so the old file keeps working until the new one is out.
 */
export interface SebConfig {
  entries: SebEntry[];
}

const CONFIG_KEY = /^[0-9a-f]{64}$/i;

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

function parseOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('PUBLIC_ORIGIN must be a URL');
  }
  if (url.protocol !== 'https:' || url.origin !== origin.replace(/\/$/, '')) {
    throw new Error('PUBLIC_ORIGIN must be https://host with no path');
  }
  return url.origin;
}

/**
 * `null` when neither `SEB_CONFIG_KEY` nor `PUBLIC_ORIGIN` is set (localhost: SEB not enforced).
 * Both may be comma-separated lists of the same length, paired by position (`PUBLIC_ORIGIN=https://new,https://old`,
 * `SEB_CONFIG_KEY=<new key>,<old key>`); the first origin is the canonical one.
 * Throws when only one is set, the counts differ or any value is malformed, so a half-configured deployment never
 * runs unchecked.
 */
export function sebConfig(env: Record<string, string | undefined> = process.env): SebConfig | null {
  const keys = list(env.SEB_CONFIG_KEY);
  const origins = list(env.PUBLIC_ORIGIN);
  if (keys.length === 0 && origins.length === 0) return null;
  if (keys.length === 0 || origins.length === 0) throw new Error('SEB_CONFIG_KEY and PUBLIC_ORIGIN must be set together');
  if (keys.length !== origins.length) {
    throw new Error('SEB_CONFIG_KEY and PUBLIC_ORIGIN must list the same number of entries, paired by position');
  }
  for (const key of keys) if (!CONFIG_KEY.test(key)) throw new Error('SEB_CONFIG_KEY must be 64 hex characters');
  return {
    entries: keys.map((key, i) => ({ configKey: key.toLowerCase(), publicOrigin: parseOrigin(origins[i]!) })),
  };
}

/** The canonical public origin: the first `PUBLIC_ORIGIN` entry, or `undefined` when unset. */
export function primaryOrigin(env: Record<string, string | undefined> = process.env): string | undefined {
  return list(env.PUBLIC_ORIGIN)[0]?.replace(/\/$/, '');
}

export function sebHash(absoluteUrl: string, configKey: string): string {
  return createHash('sha256').update(absoluteUrl + configKey).digest('hex');
}

/** `pathAndQuery` is the request target as received (`/contest/a?x=1`); a fragment is never sent. */
export function sebHeaderValid(config: SebConfig, pathAndQuery: string, header: string | null): boolean {
  if (!header || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const received = Buffer.from(header.toLowerCase(), 'hex');
  let valid = false;
  // Every entry is checked (no early exit), so timing does not reveal which entry matched.
  for (const { publicOrigin, configKey } of config.entries) {
    const expected = Buffer.from(sebHash(publicOrigin + pathAndQuery, configKey), 'hex');
    if (timingSafeEqual(expected, received)) valid = true;
  }
  return valid;
}
