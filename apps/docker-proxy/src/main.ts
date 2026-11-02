import { createProxy } from './server.ts';

const port = Number(process.env.PROXY_PORT ?? 2375);
const host = process.env.PROXY_HOST ?? '0.0.0.0';
const runnerImage = process.env.RUNNER_IMAGE ?? 'codehaunt-runner:1';
const socketPath = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';

createProxy({ socketPath, runnerImage }).listen(port, host, () => {
  console.log(JSON.stringify({ msg: 'docker-proxy listening', host, port, runnerImage }));
});
