# 010/T027. The API as a container, with ffmpeg in it.
#
# WHY A DOCKERFILE AT ALL. The media pipeline executes `ffmpeg` and `ffprobe` as
# BINARIES (T026 — it used to shell out to `docker run`, which no managed host
# allows). Render's native Node runtime provides neither, so a Node service
# there would accept an upload, fail every transcode, and leave every post
# `pending` — visible only to its author, which is 002's fourth defect exactly.
# A Docker service is how the binaries get to be present.
#
# WHY `tsx` AND NOT A `tsc` BUILD. `apps/api` has a `build` script and nothing
# runs it: CI boots the API with tsx and `smoke:boot` is run under tsx for a
# stated reason — ts-jest emits `design:paramtypes` and esbuild does not, so a
# Nest app can pass every suite and return 500 under a different runner.
# Shipping a `tsc` artifact would make the deployed path a SECOND runner that
# nothing has ever exercised, which is the shape Principle V exists for and the
# shape the four deleted AWS adapters were deleted for. The container runs the
# runner the gates run.
#
# WHAT HAS BEEN VERIFIED AND WHAT HAS NOT — 2026-09-16, in the development
# sandbox, and the distinction is the point.
#
# VERIFIED, by building this file with the ffmpeg layer removed and RUNNING the
# image against the local stack: the workspace-filtered `pnpm install`, the COPY
# layout, tsx as the runner inside a container, and the port. It answered
# `GET /v1/health` 200 and `GET /v1/interests` 200 while bound to the platform's
# `PORT` rather than to 3000 — `API listening on 0.0.0.0:8099`. Image: 573 MB
# without ffmpeg.
#
# That run is also what found the `tsconfig.base.json` line below. The first
# version of this file BUILT GREEN and the container died in under a second,
# which no amount of reading it would have shown.
#
# NOT VERIFIED: the `apt-get` layer. Debian's repositories answer 403 from this
# sandbox (CLAUDE.md, "Known dead ends"), so the one layer that puts ffmpeg in
# the image is unexercised until CI or Render runs it. The registry reached the
# sandbox build only after the agent proxy's CA was passed in, which is a
# sandbox accommodation and deliberately absent here: a CA baked into a shipped
# image is a trust decision nobody made.
FROM node:22-bookworm-slim

# ffmpeg from Debian rather than a pinned static build: the runner installs it
# exactly this way in `.github/workflows/ci.yml`, so the binary the container
# runs is the binary the suite ran against. `--no-install-recommends` because
# the default pulls in a desktop's worth of codecs' documentation, and this
# service has 512 MB.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# The manifests first, so a dependency install is cached across source edits.
# Every workspace package's manifest has to be here before `pnpm install`, or
# pnpm resolves a workspace that does not exist yet.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `tsconfig.base.json` IS A RUNTIME FILE HERE, and leaving it out produced an
# image that BUILT AND THEN DIED ON ITS FIRST BOOT:
#
#   ERROR: Parameter decorators only work when experimental decorators are
#   enabled   (apps/api/src/adapters/local/durable-event-bus.ts:33:14)
#
# `apps/api/tsconfig.json` extends it, tsx reads that chain to learn
# `experimentalDecorators`, and without it esbuild refuses every Nest decorator
# in the application. Nothing about the build says so — the build was green and
# the failure was a container that exited in under a second.
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/workers/package.json ./apps/workers/
COPY packages/shared/package.json ./packages/shared/

# `--frozen-lockfile` for the reason CI uses it: a deploy that silently resolves
# a different tree from the one the gates ran against is a deploy nothing tested.
#
# The API's own dependencies plus its workspace ones. `apps/workers` is a
# devDependency of `apps/api` and is needed at RUNTIME by the media pipeline, so
# it is installed rather than pruned — `--prod` alone would drop it and the
# service would boot and fail its first transcode.
RUN pnpm install --frozen-lockfile --filter @sih/api...

COPY packages/shared ./packages/shared
COPY apps/workers ./apps/workers
COPY apps/api ./apps/api

# `RUNTIME_PROFILE` accepts `local` only and says so if given anything else;
# there is one implementation per port and it is the one every test exercises.
ENV RUNTIME_PROFILE=local
ENV NODE_ENV=production

# Documentation, not a binding: the service reads `API_PORT`, then the `PORT`
# the platform injects, then 3000.
EXPOSE 3000

WORKDIR /app/apps/api
CMD ["pnpm", "exec", "tsx", "src/main.ts"]
