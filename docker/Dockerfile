FROM oven/bun:1.3.14-debian AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    openvpn \
    wireguard-tools \
    strongswan \
    xl2tpd ppp \
    socat \
    iproute2 iptables iputils-ping dnsutils \
    openresolv procps ca-certificates curl gnupg openssl \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://pkgs.netbird.io/debian/public.key | gpg --dearmor --batch --yes -o /usr/share/keyrings/netbird-archive-keyring.gpg \
 && printf '%s\n' 'deb [signed-by=/usr/share/keyrings/netbird-archive-keyring.gpg] https://pkgs.netbird.io/debian stable main' > /etc/apt/sources.list.d/netbird.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends netbird \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /usr/share/keyrings/tailscale-archive-keyring.gpg https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
 && curl -fsSL -o /etc/apt/sources.list.d/tailscale.list https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends tailscale \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json bun.lock* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN bun install --ignore-scripts
COPY . .
RUN bun run --cwd apps/server db:generate
RUN bun run --cwd apps/web build

FROM base AS app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/server/node_modules /app/apps/server/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/apps/server/package.json /app/apps/server/package.json
COPY --from=build /app/apps/web/dist /app/apps/web/dist
COPY --from=build /app/apps/server/prisma /app/apps/server/prisma
COPY --from=build /app/apps/server/prisma.config.ts /app/apps/server/prisma.config.ts
COPY --from=build /app/apps/server/src /app/apps/server/src
ENV NODE_ENV=production \
    WEB_DIST=/app/apps/web/dist \
    STATE_DIR=/var/lib/tunnel-gate
EXPOSE 3000 1194/udp
CMD ["sh", "-c", "cd /app/apps/server && bunx prisma migrate deploy && bun src/index.ts"]
