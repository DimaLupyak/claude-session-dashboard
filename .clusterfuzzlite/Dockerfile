FROM gcr.io/oss-fuzz-base/base-builder-javascript

COPY . $SRC/claude-session-dashboard
WORKDIR $SRC/claude-session-dashboard/apps/web

RUN npm ci

COPY .clusterfuzzlite/build.sh $SRC/build.sh
