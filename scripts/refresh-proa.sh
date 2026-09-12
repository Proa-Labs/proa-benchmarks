#!/usr/bin/env bash
set -euo pipefail

repository="https://github.com/Proa-Labs/proa"
revision="$(git ls-remote "$repository" refs/heads/main | awk 'NR == 1 { print $1 }')"

if [[ ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
  echo "could not resolve Proa main from $repository" >&2
  exit 1
fi

export CARGO_NET_GIT_FETCH_WITH_CLI=true
cargo update --package proa_core --precise "$revision"
cargo update \
  --manifest-path fixtures/airbnb-parity-dump/Cargo.toml \
  --package proa_core \
  --precise "$revision"

echo "Proa dependencies refreshed to $revision"
