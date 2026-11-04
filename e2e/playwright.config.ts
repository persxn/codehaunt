/**
 * End-to-end tests against a real stack: web (next start), the worker on the host (Docker runners), the live inference
 * gateway, and CodeHaunt's own Postgres. `make e2e` builds and starts what's needed; see e2e/README.md.
 */
import { defineConfig } from '@playwright/test';

// Not 3200: the public preview (deploy/tunnel) listens there, and reuseExistingServer would test it instead.
const PORT = Number(process.env.E2E_PORT ?? 3300);

export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1366, height: 768 }, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `npm run start -w @codehaunt/web -- -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/healthz`,
      reuseExistingServer: true,
      cwd: '..',
      env: { COOKIE_SECURE: 'false' },
    },
    {
      command: 'npm run start -w @codehaunt/worker',
      url: 'http://127.0.0.1:3111/healthz',
      reuseExistingServer: true,
      cwd: '..',
      env: { WORKER_HEALTH_PORT: '3111', JUDGE_CONCURRENCY: '4' },
    },
  ],
});
