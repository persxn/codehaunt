# deploy/gpu-cluster
Inference tier on the lab k3s cluster (ADR-016): one vLLM model server per RTX 5070 and the gateway, in namespace
`codehaunt`. Applied from gpu-master as root (`kubectl`).

## Contents
| Path | What it does |
|---|---|
| `namespace.yaml` | namespace `codehaunt` |
| `gpu-full-mode.sh` | `apply` / `revert` / `status`: full (unshared) GPUs on the 4 nodes for event week, back to `mps-3` after |
| `model-server.yaml` | `model-config` ConfigMap (model, pinned revision, vLLM flags), `model-auth` ConfigMap (key-check middleware), headless Service, StatefulSet `model` (4 pods, one per node, non-root, API key, weights on `scratch`), PDB, ServiceMonitor |
| `gateway.yaml` | `gateway-a` + `gateway-b` Deployments on different nodes, one IngressRoute path each (`/codehaunt-gateway-a/v1/`, `-b/v1/`, priority 1000), ServiceMonitor |
| `network-policy.yaml` | model pods: only the gateway and Prometheus; gateway: only Traefik and Prometheus |

## Affects / depends on
- Depends on: GPU operator `device-plugin-config` (`full` entry), Traefik CRDs (v3), Prometheus operator, topolvm
  `scratch`, the registry at `50.0.2.102:5000` (image `codehaunt/gateway`), Docker Hub `vllm/vllm-openai:v0.33.0`, Secrets `gateway-token`, `model-api-key`.
- Used by: the DGX web API (`GATEWAY_URL=https://gpu-master.<tailnet>.ts.net/codehaunt-gateway-a`,
  `GATEWAY_FALLBACK_URL=…/codehaunt-gateway-b`, `GATEWAY_TOKEN`); Tailscale Serve on gpu-master proxies to Traefik.
- Changing `model-config` changes the participants' model: restart `statefulset/model` and both gateways.

## Entry points & how to test
```bash
./gpu-full-mode.sh apply                                   # client-approved; revert after the event
kubectl apply -f namespace.yaml
# Secrets: write each value to a 0600 file, create from the file, shred it (never on a command line).
kubectl -n codehaunt create secret generic gateway-token --from-file=token=<file>   # same value as the DGX GATEWAY_TOKEN
kubectl -n codehaunt create secret generic model-api-key --from-file=key=<file>     # gateway → vLLM key
kubectl apply -f model-server.yaml -f gateway.yaml -f network-policy.yaml
kubectl -n codehaunt get pods -o wide                      # model-0..3 on 4 nodes, gateway-a/b on 2 nodes
```
Load test from the DGX: `apps/gateway/load/README.md`.

## Gotchas
- Never run anything here during the event other than reading status: the GPUs are the participants' model.
- Secrets are never committed; the DGX `.env` holds the gateway token, only the cluster holds the model key.
- Images are pinned by digest (the lab registry is plain HTTP). After rebuilding the gateway, push it and update the
  digest in `gateway.yaml`.
- vLLM runs as uid 1000 with no capabilities. Its own `VLLM_API_KEY` covers only `/v1/*`, so the `model-auth`
  middleware (`codehaunt_auth.RequireKey`) requires the key on every path except `/health` and `/metrics`; the weights' commit is pinned in
  `model-config` and fetched only if missing, so a pod restart never downloads during the event.
- A model pod's PVC binds to the node it first ran on; deleting the PVC re-downloads the weights (~5 GB).
- The vLLM image (9.7 GB) comes from Docker Hub; pre-pull it on every node (`crictl pull`) before applying, so a
  rescheduled pod never waits on the lab uplink. Mirroring it into the local registry fails (k3s discards pulled blobs).
- `gpu-full-mode.sh revert` must run after the event (ADR-016 §2); MPS sharing comes back on the next device-plugin sync.
