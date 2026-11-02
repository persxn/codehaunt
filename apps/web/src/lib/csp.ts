/**
 * Content-Security-Policy with a fresh nonce per request (WP-01 audit F9): scripts run only if they carry the
 * nonce (Next adds it to its own scripts when it sees the policy on the request) or are loaded by one that does.
 * No 'unsafe-inline' for scripts. Styles keep 'unsafe-inline' (Next's style injection, dynamic widths).
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // The check-in page reads the phone camera (getUserMedia → <video>).
    "media-src 'self' blob:",
  ].join('; ');
}

export function newNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}
