#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
exec sh "$root/tools/run-update.sh" "$root" tools/update.mjs --all "$@"
