# Sandbox image for judging C++ submissions.
#
# Separate from the C image, for the reason the Java image states: every byte in
# a sandbox image is reachable by student code, and most submissions are not C++.
# g++ and libstdc++ together are a good deal larger than the C toolchain.
#
# ── bits/stdc++.h ────────────────────────────────────────────────────────────
#
# The header every competitive programmer types on the first line. It is not
# standard C++ — it is a libstdc++ convenience header that includes the whole
# standard library — so it exists only where GCC's C++ headers are installed.
# `g++` on Debian pulls `libstdc++-dev`, which is what carries it, and the build
# below compiles a program that uses it rather than trusting that.
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      g++ \
      libc6-dev \
      libstdc++-12-dev \
      python3 \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man

# Fail the build rather than ship an image that cannot compile what students
# will actually write. The alternative is discovering it on a submission, where
# the only symptom is a compile error nobody can reproduce locally.
#
# Static, because that is how the judge compiles: a dynamically linked binary
# that finds no libstdc++ at run time fails at the point the student is timed.
RUN printf '#include <bits/stdc++.h>\nusing namespace std;\nint main(){vector<int> v{3,1,2};sort(v.begin(),v.end());for(int x:v)cout<<x;return 0;}\n' > /tmp/probe.cpp \
 && /usr/bin/g++ -O2 -std=gnu++17 -static -o /tmp/probe /tmp/probe.cpp \
 && [ "$(/tmp/probe)" = "123" ] \
 && rm -f /tmp/probe /tmp/probe.cpp \
 && /usr/bin/python3 --version

COPY runner.py /opt/cjudge/runner.py
RUN chmod 0555 /opt/cjudge/runner.py

USER 65534:65534
WORKDIR /box
ENTRYPOINT ["python3", "/opt/cjudge/runner.py"]
