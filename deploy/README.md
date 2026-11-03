# deploy
Deployment manifests for what does not run under `docker-compose.yml`.

## Contents
| Path | What it does |
|---|---|
| `tunnel/` | Cloudflare tunnel `codehaunt` → web on 127.0.0.1:3100: user unit, ingress, teardown (`tunnel/README.md`) |
| `gpu-cluster/` | k3s manifests for the inference tier: model servers, gateway, network policy, full-GPU switch (`gpu-cluster/README.md`) |

## Affects / depends on
- Depends on: the lab k3s cluster (Traefik, GPU operator, Prometheus operator, topolvm `scratch`, registry 50.0.2.102:5000).
- Used by: the DGX web API, which calls the gateway through Traefik; the public hostname (tunnel).

## Entry points & how to test
See `gpu-cluster/README.md`.

## Gotchas
Changes here act on a shared lab cluster: apply only what the README lists, and only into namespace `codehaunt`.
