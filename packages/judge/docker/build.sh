#!/usr/bin/env bash
# Builds the judge sandbox image. runner.py is copied in from the judge package
# so there is exactly one copy of the compile/run logic in the repository.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkg="$(cd "$here/.." && pwd)"
image="${CJUDGE_RUNNER_IMAGE:-codehaunt-runner:1}"
name="${image%%:*}"
tag="${image##*:}"

build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT

cp "$here/Dockerfile" "$build_dir/"
cp "$pkg/src/runner/runner.py" "$build_dir/runner.py"

cp "$here/Dockerfile.java"   "$build_dir/"
cp "$here/Dockerfile.python" "$build_dir/"
cp "$here/Dockerfile.cpp"    "$build_dir/"

# One runner.py, three images. The compile/measure/limit semantics live in that
# single file precisely so they cannot drift between languages any more than
# they can drift between backends.
docker build -t "$image" "$build_dir"
echo "built $image"

docker build -f "$build_dir/Dockerfile.java"   -t "$name-java:$tag"   "$build_dir"
echo "built $name-java:$tag"

docker build -f "$build_dir/Dockerfile.python" -t "$name-python:$tag" "$build_dir"
echo "built $name-python:$tag"

docker build -f "$build_dir/Dockerfile.cpp"    -t "$name-cpp:$tag"    "$build_dir"
echo "built $name-cpp:$tag"
