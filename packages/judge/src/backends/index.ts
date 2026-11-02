/**
 * Backend selection.
 *
 * Docker is always preferred. The local backend is only ever reached when it
 * has been explicitly enabled for development, and selecting it emits a warning
 * so it can never be mistaken for a production configuration.
 */

import { DockerBackend } from './docker.ts';
import { LocalBackend } from './local.ts';
import type { ExecutionBackend } from './types.ts';

export { DockerBackend } from './docker.ts';
export { LocalBackend } from './local.ts';
export * from './types.ts';

export class NoBackendAvailableError extends Error {
  constructor() {
    super(
      'No execution backend available. Install Docker and build the runner image ' +
        '(docker/runner/build.sh), or set CJUDGE_ALLOW_LOCAL_BACKEND=1 for local development.',
    );
    this.name = 'NoBackendAvailableError';
  }
}

export async function selectBackend(): Promise<ExecutionBackend> {
  const docker = new DockerBackend();
  if (await docker.isAvailable()) return docker;

  const local = new LocalBackend();
  if (await local.isAvailable()) {
    console.warn(
      '[cjudge] Using the LOCAL backend. Student code is NOT filesystem-isolated. ' +
        'Development only — never serve students from this configuration.',
    );
    return local;
  }

  throw new NoBackendAvailableError();
}
