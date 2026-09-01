# syntax=docker/dockerfile:1
#
# One browser session, one container. Chrome speaks CDP over a *pipe* (fd 3/4),
# never a debugging port, so this image opens no socket on any interface and
# there is no address for a second session — or a hostile page inside this one —
# to aim at. The only channel is the stdio of the `docker run` that started it.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-core \
      fonts-noto-cjk \
      coreutils \
    && rm -rf /var/lib/apt/lists/*

# Non-root, no shell, no home outside the profile it owns. Chrome's own setuid
# helper is left in place; the userns sandbox this image relies on needs no
# capability at all, which is why the run can drop every one of them.
RUN groupadd --gid 1001 shopper \
    && useradd --uid 1001 --gid 1001 --create-home --home-dir /home/shopper shopper \
    && mkdir -p /home/shopper/profile/Default /home/shopper/downloads \
    && chown -R shopper:shopper /home/shopper

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
