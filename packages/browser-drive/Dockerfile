# syntax=docker/dockerfile:1
#
# One browser session, one container. Chrome speaks CDP over a *pipe* (fd 3/4),
# never a debugging port, so this image opens no socket on any interface and
# there is no address for a second session — or a hostile page inside this one —
# to aim at. The only channel is the stdio of the `docker run` that started it.
#
# DECISION: the browser is `chrome-headless-shell` from Chrome for Testing, on
# `debian:trixie-slim` — not Debian's `chromium` package on bookworm. That
# package is the whole desktop browser and drags the desktop in with it (GTK,
# printing, media, a11y): 266 packages and 1.32 GB, most of it libraries a
# headless sandbox never loads and every one of them CVE surface. The shell is
# the same Blink and the same CDP surface with the UI layer absent, so nothing
# in the drive layer changes; what changes is that only the libraries the
# binary actually links are installed.
#
# Pinned deliberately: a floating "latest" would change the browser under a
# session whose whole point is that it is reproducible. Current Stable is at
# https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json
ARG CHROME_VERSION=152.0.7977.75

# ---------------------------------------------------------------------------
# Fetch stage: curl and unzip live here and nowhere else, so the shipped image
# carries no downloader for a compromised renderer to point back at the network.
# ---------------------------------------------------------------------------
FROM debian:trixie-slim AS fetch
ARG CHROME_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      unzip \
    && curl -fsSL --retry 3 -o /tmp/shell.zip \
      "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" \
    && unzip -q /tmp/shell.zip -d /opt \
    && mv /opt/chrome-headless-shell-linux64 /opt/chrome-headless-shell \
    && rm -f /tmp/shell.zip \
    && chmod -R a+rX /opt/chrome-headless-shell \
    && chmod 0555 /opt/chrome-headless-shell/chrome-headless-shell

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM debian:trixie-slim

# Exactly the shared objects `ldd chrome-headless-shell` names, and nothing
# else. The bundle ships a `deb.deps` listing full Chrome's Debian dependencies
# — GTK, cups, cairo, pango, libcurl, wget, xdg-utils — and the shell links none
# of them, so that list is not the one used here; `ldd` inside the build is,
# and the build re-checks it below, where an unresolved SONAME fails the image
# rather than the first session. libdrm2, libudev1 and libcap2 arrive as
# dependencies of these and are not named twice; Vulkan and SwiftShader come
# from the bundle itself.
#
# The expensive one is libgbm1: the shell has libgbm.so.1 in its NEEDED list,
# and Debian's libgbm1 depends on mesa-libgallium, which depends on libllvm19,
# which depends on libz3-4 — ~195 MB of software rasteriser for a container
# with no /dev/dri in it. It stays because the loader will not start the
# binary without it; removing it would mean shipping a broken dpkg state.
#
# `coreutils` is in the base image already; it is named because the entrypoint's
# hard TTL is `timeout` from it, and a later slimming pass must not quietly take
# it away.
#
# Fonts: Liberation for the Latin metrics a storefront expects, and Noto core,
# which is where Devanagari lives — a Hindi shop has to render. `fontconfig-config`
# is here for a reason that costs an afternoon to find: Chrome carries fontconfig
# inside the binary, so nothing in `ldd` asks for it, and without /etc/fonts/fonts.conf
# it matches no family at all — the fonts are installed, the page is blank, and the
# only clue is one line of `Fontconfig error` in Chrome's stderr.
#
# DECISION: `fonts-noto-cjk` is dropped. It is ~190 MB installed, a third of
# this image again, for scripts no shop in this errand's reach uses; the old
# image carried it only because it was cheap beside a 1.32 GB base. A CJK page
# renders tofu here. Put it back the day one of them matters.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      coreutils \
      fontconfig-config \
      fonts-liberation \
      fonts-noto-core \
      libasound2t64 \
      libatk-bridge2.0-0t64 \
      libatk1.0-0t64 \
      libatspi2.0-0t64 \
      libdbus-1-3 \
      libexpat1 \
      libgbm1 \
      libglib2.0-0t64 \
      libnspr4 \
      libnss3 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# Non-root, no home outside the profile it owns. There is no setuid sandbox
# helper in this image and none is wanted: the run grants CAP_SYS_CHROOT and a
# seccomp profile that permits CLONE_NEWUSER, so Chrome builds its namespace
# sandbox itself, as uid 1001, holding no effective capability.
RUN groupadd --gid 1001 shopper \
    && useradd --uid 1001 --gid 1001 --create-home --home-dir /home/shopper shopper \
    && mkdir -p /home/shopper/profile/Default /home/shopper/downloads \
    && chown -R shopper:shopper /home/shopper

COPY --from=fetch /opt/chrome-headless-shell /opt/chrome-headless-shell
# The entrypoint, and anything else that knows this image, says `/usr/bin/chromium`.
# One symlink keeps that name true. Chrome finds its own resource directory
# through /proc/self/exe, which resolves the link, so the shell still reads its
# locales and ICU data from beside the real binary.
RUN ln -s /opt/chrome-headless-shell/chrome-headless-shell /usr/bin/chromium \
    && ! ldd /usr/bin/chromium | grep "not found" \
    && /usr/bin/chromium --version

# The local fixture shop, so the offline demo works on this surface too. It
# lives outside /home/shopper, which is a tmpfs at runtime and would shadow it.
COPY fixtures/shop /opt/covenant/fixtures/shop

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0555 /usr/local/bin/entrypoint.sh

USER shopper
WORKDIR /home/shopper
ENV COVENANT_PROFILE_DIR=/home/shopper/profile \
    COVENANT_DOWNLOAD_DIR=/home/shopper/downloads \
    COVENANT_TTL_SECONDS=900
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
