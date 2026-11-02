/**
 * Security headers on every response; workspace packages are TypeScript sources, transpiled here.
 * The Content-Security-Policy is set per request by middleware.ts (nonce-based, src/lib/csp.ts).
 */
export default {
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@codehaunt/auth', '@codehaunt/contracts', '@codehaunt/core', '@codehaunt/db'],
  serverExternalPackages: ['@prisma/client', 'pg', '@node-rs/argon2'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
