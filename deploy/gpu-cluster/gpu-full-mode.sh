#!/usr/bin/env bash
# Full (unshared) GPUs for CodeHaunt during event week (ADR-016 §2, client-approved R5-Q1/R6-Q1).
# Run on gpu-master as root. `apply` adds a `full` entry to the GPU operator's device-plugin config and labels the
# nodes; `revert` removes the labels (nodes fall back to the operator default `mps-3`) and the entry.
# The device plugin re-reads the label within ~30 s; pods already holding a GPU keep it until they stop.
set -euo pipefail
NODES=(${NODES:-gpu-master gpu-worker-1 gpu-worker-2 gpu-worker-3})
CM="-n gpu-operator configmap/device-plugin-config"
case "${1:-status}" in
  apply)
    kubectl patch $CM --type merge -p '{"data":{"full":"version: v1\nflags:\n  migStrategy: none\n"}}'
    for n in "${NODES[@]}"; do kubectl label node "$n" nvidia.com/device-plugin.config=full --overwrite; done ;;
  revert)
    for n in "${NODES[@]}"; do kubectl label node "$n" nvidia.com/device-plugin.config-; done
    sleep 60  # let every node switch back before the entry it uses disappears
    kubectl patch $CM --type json -p '[{"op":"remove","path":"/data/full"}]' ;;
  status) ;;
  *) echo "usage: $0 apply|revert|status" >&2; exit 2 ;;
esac
kubectl get nodes -L nvidia.com/device-plugin.config,nvidia.com/gpu.replicas,nvidia.com/gpu.sharing-strategy
