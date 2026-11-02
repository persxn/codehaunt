# Sandbox image for judging Java submissions.
#
# Separate from the C image on purpose. A JDK is the better part of two hundred
# megabytes, and every byte in a sandbox image is reachable by student code —
# putting it alongside the C toolchain would enlarge the surface of the runs
# that never touch Java, which is most of them.
#
# Temurin's JRE would be smaller still, but javac is needed: the submission is
# compiled inside the sandbox, not outside it, so that a compile that hangs or
# floods is bounded by the same limits everything else is.
FROM eclipse-temurin:21-jdk-alpine

# The runner is Python; the JDK image has none.
RUN apk add --no-cache python3 \
 && rm -rf /var/cache/apk/*

# The runner execs absolute paths, and the JDK lives under /opt rather than on
# the default PATH prefix.
#
# python3 is deliberately *not* linked here. apk already installs it at
# /usr/bin/python3, and a `ln -sf "$(command -v python3)" /usr/bin/python3`
# resolves to that same path — pointing the symlink at itself and destroying the
# binary. The container then failed to start at all, with "executable file not
# found in $PATH" from runc and no clue as to why.
RUN ln -sf /opt/java/openjdk/bin/javac /usr/bin/javac \
 && ln -sf /opt/java/openjdk/bin/java  /usr/bin/java

# Fail the build rather than ship an image whose toolchain is missing. Every one
# of these is exec'd by absolute path at judge time, where the only symptom is an
# internal error on a student's submission.
RUN /usr/bin/python3 --version \
 && /usr/bin/javac --version \
 && /usr/bin/java --version

# Baked in rather than bind-mounted: a runner script writable by the web app
# would be a path from "compromise the app" to "control the sandbox".
COPY runner.py /opt/cjudge/runner.py
RUN chmod 0555 /opt/cjudge/runner.py

USER 65534:65534
WORKDIR /box
ENTRYPOINT ["python3", "/opt/cjudge/runner.py"]
