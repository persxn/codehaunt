# Sandbox image for judging student C submissions.
#
# Kept deliberately thin: a C toolchain and a Python interpreter to drive it.
# Every byte in here is reachable by student code, so nothing else belongs.
FROM debian:bookworm-slim

# `python3`, not `python3-minimal`: the minimal package omits the standard
# library, so the runner cannot even `import json`. The full interpreter is a
# few MB more and is what the runner actually needs (json, resource, signal,
# tempfile).
RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      gcc \
      libc6-dev \
      python3 \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man

# Baked in rather than bind-mounted: a runner script writable by the web app
# would be a path from "compromise the app" to "control the sandbox".
COPY runner.py /opt/cjudge/runner.py
RUN chmod 0555 /opt/cjudge/runner.py

# Containers are additionally launched with --user 65534:65534, --read-only,
# --network=none, --cap-drop=ALL and cgroup limits (see DockerBackend).
USER 65534:65534
WORKDIR /box

ENTRYPOINT ["python3", "/opt/cjudge/runner.py"]
