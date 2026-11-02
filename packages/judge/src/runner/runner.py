#!/usr/bin/env python3
"""
In-sandbox runner: compiles one submission and runs it against every test case.

This script is the *only* thing that touches student code. It is deliberately
isolation-agnostic — Docker and the local `unshare` backend both invoke it the
same way, so compile/measure/limit semantics cannot drift between the two.

Protocol:
    stdin  <- one JSON job object
    stdout -> one JSON result object
    stderr -> runner diagnostics only (never student output)

Expected outputs are NEVER part of the job. The sandbox has no way to read the
answers even if the student's program escapes into the runner's own files.
"""

import json
import os
import resource
import signal
import sys
import tempfile
import time

MB = 1024 * 1024

# ---------------------------------------------------------------------------
# Languages
# ---------------------------------------------------------------------------
#
# One table, because everything that differs between C, Java and Python differs
# here and nowhere else — the measurement, the limits and the reporting are
# identical for all three, and that is the property worth protecting.
#
# `asLimit` is the field with teeth. RLIMIT_AS caps *virtual* address space, and
# a JVM reserves on the order of a gigabyte of it at startup no matter how small
# its heap is — so setting RLIMIT_AS for Java means `java` never starts, and the
# failure looks like a crash in the student's code. For Java, memory is enforced
# by the container cgroup (`--memory`, set by the Docker backend) and bounded
# inside the process by `-Xmx`. That is a real limit, not an absent one, but it
# lives in a different place and the local backend does not have it — which is
# why the local backend refuses Java outright.
#
# `nofile` matters for the same reason: a JVM opens its own jars, /proc entries
# and class path far past the 64 descriptors a C program needs.

LANGUAGES = {
    "c": {
        "filename": "sol.c",
        "compile": lambda work, src: [
            "/usr/bin/gcc", "-O2", "-std=c11", "-Wall", "-static", "-fno-asm",
            "-o", os.path.join(work, "prog"), src,
        ],
        "compile_suffix": ["-lm"],
        "run": lambda work, src, mem_mb: [os.path.join(work, "prog")],
        "asLimit": True,
        "nofile": 64,
    },
    "cpp": {
        "filename": "sol.cpp",
        # `gnu++17`, not `c++17`. Competitive C++ leans on GNU extensions —
        # __int128, __builtin_popcount, and `bits/stdc++.h` itself, which is a
        # libstdc++ header rather than a standard one. Judges students have used
        # elsewhere compile this way, and a program that builds on Codeforces and
        # not here would read as the judge being broken.
        "compile": lambda work, src: [
            "/usr/bin/g++", "-O2", "-std=gnu++17", "-Wall", "-static",
            "-o", os.path.join(work, "prog"), src,
        ],
        # No `-lm`: libstdc++ already pulls the maths functions in, and a static
        # link resolves them from the same archive.
        "compile_suffix": [],
        "run": lambda work, src, mem_mb: [os.path.join(work, "prog")],
        "asLimit": True,
        # A statically linked C++ binary opens no more files than a C one; the
        # standard library is in the executable rather than on disk.
        "nofile": 64,
    },
    "python": {
        "filename": "sol.py",
        # A syntax check, so a typo is a compile error the student can read
        # rather than a runtime crash on every single test case.
        "compile": lambda work, src: ["/usr/bin/python3", "-m", "py_compile", src],
        "compile_suffix": [],
        # `-I` is isolated mode: no site-packages, no PYTHONPATH from the
        # environment, no current directory on sys.path beyond the script's own.
        # `-B` keeps it from writing .pyc files into the work directory.
        "run": lambda work, src, mem_mb: ["/usr/bin/python3", "-I", "-B", src],
        "asLimit": True,
        # Imports of the standard library open a good many more files than a
        # compiled C program ever does.
        "nofile": 256,
    },
    "java": {
        # javac insists the file be named after its public class, so the starter
        # code declares `Main` and the filename follows from that rather than the
        # other way round.
        "filename": "Main.java",
        "compile": lambda work, src: ["/usr/bin/javac", "-nowarn", "-d", work, src],
        "compile_suffix": [],
        "run": lambda work, src, mem_mb: [
            "/usr/bin/java",
            # Bound the heap inside the process, since RLIMIT_AS cannot be used.
            "-Xmx%dm" % max(64, mem_mb - 64),
            "-Xss16m",
            # Startup, which counts against the student's time limit: the serial
            # collector avoids spinning up GC threads, and stopping tiered
            # compilation at level 1 skips the C2 compiler entirely. Neither
            # changes what the program computes.
            "-XX:+UseSerialGC",
            "-XX:TieredStopAtLevel=1",
            "-XX:-UsePerfData",
            "-cp", work, "Main",
        ],
        "asLimit": False,
        "nofile": 1024,
    },
}


def language_spec(job):
    """The job's language, defaulting to C for jobs written before there were any."""
    name = (job.get("language") or "c").lower()
    spec = LANGUAGES.get(name)
    if spec is None:
        raise ValueError("unsupported language: %s" % name)
    return name, spec

# Signals that mean "the sandbox stopped you", as opposed to a genuine crash.
SIGNAL_NAMES = {
    signal.SIGSEGV: "SIGSEGV",
    signal.SIGABRT: "SIGABRT",
    signal.SIGFPE: "SIGFPE",
    signal.SIGBUS: "SIGBUS",
    signal.SIGILL: "SIGILL",
    signal.SIGKILL: "SIGKILL",
    signal.SIGXFSZ: "SIGXFSZ",
    signal.SIGXCPU: "SIGXCPU",
    signal.SIGPIPE: "SIGPIPE",
    signal.SIGSYS: "SIGSYS",
}


class Timeout(Exception):
    pass


def _on_alarm(signum, frame):
    raise Timeout()


def spawn_and_wait(argv, cwd, stdin_fd, stdout_fd, stderr_fd, limits, timeout_ms):
    """
    Fork/exec `argv` under hard resource limits and wait for it, with a wall-clock
    deadline. Returns (exit_code, signal_number, wall_ms, max_rss_kb, timed_out).

    The child gets its own session (setsid) so that a fork bomb or a program that
    spawns helpers can be killed as an entire process group, not one stray pid.
    """
    as_bytes = limits["memoryLimitMb"] * MB
    # See the LANGUAGES table: a JVM cannot start under an RLIMIT_AS, so for
    # Java the ceiling is the container cgroup and -Xmx instead. Absent means
    # "not this way", never "not at all".
    set_as = limits.get("asLimit", True)
    nofile = limits.get("nofile", 64)
    fsize = limits["outputLimitBytes"]
    # A pidLimit of 0 or None means "do not set RLIMIT_NPROC". Under Docker the
    # cgroup pids controller (--pids-limit) is the correct control: RLIMIT_NPROC
    # counts processes per-UID across the whole host, so unrelated processes
    # running as the same uid outside the container consume the budget and gcc
    # fails with "vfork: Resource temporarily unavailable". The local backend has
    # no cgroup available and still sets it.
    nproc = limits.get("pidLimit") or 0
    # Give the CPU limit a second of headroom over the wall clock: the wall-clock
    # alarm is the real deadline, this is just a backstop for a busy-loop that
    # somehow outlives it.
    cpu_seconds = max(1, timeout_ms // 1000 + 1)

    pid = os.fork()
    if pid == 0:
        # ---- child ----
        try:
            os.setsid()
            os.dup2(stdin_fd, 0)
            os.dup2(stdout_fd, 1)
            os.dup2(stderr_fd, 2)

            if set_as:
                resource.setrlimit(resource.RLIMIT_AS, (as_bytes, as_bytes))
            # Exceeding RLIMIT_FSIZE raises SIGXFSZ, which is how output floods
            # are stopped without the runner ever buffering gigabytes.
            resource.setrlimit(resource.RLIMIT_FSIZE, (fsize, fsize))
            if nproc > 0:
                resource.setrlimit(resource.RLIMIT_NPROC, (nproc, nproc))
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            # No new files beyond what the program legitimately needs.
            resource.setrlimit(resource.RLIMIT_NOFILE, (nofile, nofile))

            os.chdir(cwd)
            os.execv(argv[0], argv)
        except Exception:
            os._exit(127)
        os._exit(127)

    # ---- parent ----
    started = time.monotonic()
    timed_out = False
    previous = signal.signal(signal.SIGALRM, _on_alarm)
    signal.setitimer(signal.ITIMER_REAL, timeout_ms / 1000.0)
    try:
        _, status, usage = os.wait4(pid, 0)
    except Timeout:
        timed_out = True
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        _, status, usage = os.wait4(pid, 0)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)

    wall_ms = int((time.monotonic() - started) * 1000)

    # Reap anything the child left behind before the process group was killed,
    # so a fork bomb cannot leave zombies accumulating across test cases.
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    while True:
        try:
            if os.waitpid(-1, os.WNOHANG) == (0, 0):
                break
        except ChildProcessError:
            break

    if os.WIFSIGNALED(status):
        return None, os.WTERMSIG(status), wall_ms, usage.ru_maxrss, timed_out
    return os.WEXITSTATUS(status), None, wall_ms, usage.ru_maxrss, timed_out


def compile_source(workdir, source, compile_limits, extra_args, spec):
    """Compiles the submission. Returns (ok, diagnostics, source_path)."""
    src_path = os.path.join(workdir, spec["filename"])
    with open(src_path, "w") as handle:
        handle.write(source)

    log_path = os.path.join(workdir, "compile.log")
    null_fd = os.open(os.devnull, os.O_RDONLY)
    log_fd = os.open(log_path, os.O_RDWR | os.O_CREAT | os.O_TRUNC, 0o600)

    argv = spec["compile"](workdir, src_path) + list(extra_args) + spec["compile_suffix"]

    # RLIMIT_FSIZE during compilation governs the *binary* gcc writes, not the
    # diagnostics: a statically linked C program is comfortably over a megabyte,
    # and sizing this from the log budget makes the linker fail with
    # "File too large". The log is bounded separately, when it is read back.
    limits = {
        "memoryLimitMb": compile_limits["memoryLimitMb"],
        "outputLimitBytes": compile_limits.get("binaryLimitBytes", 64 * MB),
        # gcc forks cc1, as and collect2; it inherits whatever process ceiling
        # the execution limits use rather than a separate one.
        "pidLimit": compile_limits.get("pidLimit", 0),
        # javac is itself a Java program and cannot start under an RLIMIT_AS
        # either, for exactly the reason the runtime cannot.
        "asLimit": spec["asLimit"],
        "nofile": spec["nofile"],
    }
    code, sig, _, _, timed_out = spawn_and_wait(
        argv, workdir, null_fd, log_fd, log_fd, limits, compile_limits["timeLimitMs"]
    )
    os.close(null_fd)
    os.close(log_fd)

    with open(log_path, "rb") as handle:
        raw = handle.read(compile_limits["logLimitBytes"])
    log = raw.decode("utf-8", errors="replace")

    if timed_out:
        return False, "Compilation timed out. Check for a pathological macro or template expansion.", src_path
    if sig is not None:
        return (
            False,
            log + "\n[compiler terminated by %s]" % SIGNAL_NAMES.get(sig, "signal %d" % sig),
            src_path,
        )
    return code == 0, log, src_path


def run_test(workdir, test, limits, spec, src_path):
    """Runs the compiled submission against one test case and reports raw facts."""
    stdin_path = os.path.join(workdir, "input.txt")
    with open(stdin_path, "w") as handle:
        handle.write(test["input"])

    stdout_path = os.path.join(workdir, "output.txt")
    stdin_fd = os.open(stdin_path, os.O_RDONLY)
    stdout_fd = os.open(stdout_path, os.O_RDWR | os.O_CREAT | os.O_TRUNC, 0o600)
    stderr_fd = os.open(os.devnull, os.O_WRONLY)

    code, sig, wall_ms, max_rss_kb, timed_out = spawn_and_wait(
        spec["run"](workdir, src_path, limits["memoryLimitMb"]),
        workdir,
        stdin_fd,
        stdout_fd,
        stderr_fd,
        limits,
        limits["timeLimitMs"],
    )

    os.close(stdin_fd)
    os.close(stdout_fd)
    os.close(stderr_fd)

    size = os.path.getsize(stdout_path)
    with open(stdout_path, "rb") as handle:
        stdout = handle.read(limits["outputLimitBytes"]).decode("utf-8", errors="replace")

    return {
        "testId": test["id"],
        "exitCode": code,
        "signal": SIGNAL_NAMES.get(sig, ("signal %d" % sig) if sig is not None else None),
        "stdout": stdout,
        "timeMs": wall_ms,
        "memoryKb": max_rss_kb,
        # SIGXFSZ is the RLIMIT_FSIZE trip wire; a size at the cap means the
        # program was still writing when it was stopped.
        "truncated": sig == signal.SIGXFSZ or size >= limits["outputLimitBytes"],
        "timedOut": timed_out,
    }


def main():
    job = json.load(sys.stdin)
    workdir = tempfile.mkdtemp(prefix="judge-", dir=job.get("workRoot") or None)

    try:
        _name, spec = language_spec(job)
    except ValueError as error:
        json.dump({"compiled": False, "compileLog": str(error), "runs": []}, sys.stdout)
        return

    ok, log, src_path = compile_source(
        workdir, job["source"], job["compileLimits"], job.get("compileArgs", []), spec
    )
    if not ok:
        json.dump({"compiled": False, "compileLog": log, "runs": []}, sys.stdout)
        return

    # The per-language rlimit policy applies to the student's program too, not
    # only to the compiler.
    limits = dict(job["limits"])
    limits["asLimit"] = spec["asLimit"]
    limits["nofile"] = spec["nofile"]

    runs = []
    for test in job["tests"]:
        runs.append(run_test(workdir, test, limits, spec, src_path))

    json.dump({"compiled": True, "compileLog": log, "runs": runs}, sys.stdout)


if __name__ == "__main__":
    main()
