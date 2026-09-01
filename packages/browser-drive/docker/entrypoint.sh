#!/bin/sh
set -eu

# Chrome reads CDP commands from fd 3 and writes events to fd 4. Wiring those to
# the container's stdin/stdout is what makes `docker run -i` a transport: the
# host end is an ordinary child process, and no port is opened anywhere. fd 1 is
# then pointed at stderr so a stray Chrome print can never corrupt the protocol.
exec 3<&0 4>&1 1>&2

# The home directory is a tmpfs, so it arrives empty on every start.
mkdir -p "${COVENANT_PROFILE_DIR}/Default" "${COVENANT_DOWNLOAD_DIR}"

printf '%s' "${COVENANT_CHROME_PREFS:-{\}}" > "${COVENANT_PROFILE_DIR}/Default/Preferences"

# The hard ceiling, enforced container-side on purpose: a host that crashed or
# was unplugged cannot run a timer, so the host must not be the thing holding
# the limit. An abandoned errand dies here, on its own, without anyone's help.
exec timeout --signal=TERM --kill-after=10s "${COVENANT_TTL_SECONDS}s" \
  /usr/bin/chromium --remote-debugging-pipe "$@"
