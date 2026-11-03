/**
 * Safe Exam Browser Config Key check (ADR-013 §3).
 *
 * SEB for Windows sends `X-SafeExamBrowser-ConfigKeyHash` = SHA-256(absolute URL without fragment + Config Key),
 * hex, on every request. The URL is the one the browser asked for, so it is rebuilt from the configured public
 * origin, never from the Host header: behind the tunnel the app sees an internal origin, and Host is client-controlled.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const SEB_HEADER = 'x-safeexambrowser-configkeyhash';

export interface SebConfig {
  /** 64 hex characters, lowercase. */
  configKey: string;
  /** `https://host[:port]`, no trailing slash or path. */
  publicOrigin: string;
}

const CONFIG_KEY = /^[0-9a-f]{64}$/i;

/**
 * `null` when neither `SEB_CONFIG_KEY` nor `PUBLIC_ORIGIN` is set (localhost: SEB not enforced).
 * Throws when only one is set or either is malformed, so a half-configured deployment never runs unchecked.
 */
export function sebConfig(env: Record<string, string | undefined> = process.env): SebConfig | null {
  const key = env.SEB_CONFIG_KEY?.trim() || undefined;
  const origin = env.PUBLIC_ORIGIN?.trim() || undefined;
  if (!key && !origin) return null;
  if (!key || !origin) throw new Error('SEB_CONFIG_KEY and PUBLIC_ORIGIN must be set together');
  if (!CONFIG_KEY.test(key)) throw new Error('SEB_CONFIG_KEY must be 64 hex characters');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('PUBLIC_ORIGIN must be a URL');
  }
  if (url.protocol !== 'https:' || url.origin !== origin.replace(/\/$/, '')) {
    throw new Error('PUBLIC_ORIGIN must be https://host with no path');
  }
  return { configKey: key.toLowerCase(), publicOrigin: url.origin };
}

export function sebHash(absoluteUrl: string, configKey: string): string {
  return createHash('sha256').update(absoluteUrl + configKey).digest('hex');
}

/** `pathAndQuery` is the request target as received (`/contest/a?x=1`); a fragment is never sent. */
export function sebHeaderValid(config: SebConfig, pathAndQuery: string, header: string | null): boolean {
  if (!header || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = Buffer.from(sebHash(config.publicOrigin + pathAndQuery, config.configKey), 'hex');
  return timingSafeEqual(expected, Buffer.from(header.toLowerCase(), 'hex'));
}
