#!/bin/sh
# Use local Node 22+/Git when available; otherwise run the same updater in Docker.
set -eu
root=$1
entry=$2
shift 2
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$root"
if command -v node >/dev/null 2>&1 && command -v git >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
    exec node "$root/$entry" "$@"
fi
if ! command -v docker >/dev/null 2>&1; then
    printf '%s\n' 'Install Node 22+ and Git, or start Docker Desktop, to update Foundation.' >&2
    exit 1
fi
workspace=$(dirname "$root")
docker build -q -f "$script_dir/update.Dockerfile" -t velora-foundation-tools:node22 "$script_dir" >/dev/null
# Mount the sibling checkout workspace at its original path so Git and custom --app paths agree.
# Extra --source/--app paths outside that workspace need a direct Node invocation instead.
exec docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
    -v "$workspace:$workspace" -w "$root" \
    velora-foundation-tools:node22 node "$root/$entry" "$@"
