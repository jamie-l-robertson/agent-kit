#!/usr/bin/env bash
# Install agent kit into the current directory from GitHub, then tell you to run setup.
#
# Usage (from your project root):
#   curl -fsSL https://raw.githubusercontent.com/jamie-l-robertson/agent-kit/main/scripts/install.sh | bash
#
# Pin a ref:
#   curl -fsSL https://raw.githubusercontent.com/jamie-l-robertson/agent-kit/main/scripts/install.sh \
#     | AGENT_KIT_REF=main bash
#
# Local kit checkout:
#   /path/to/agent-kit/scripts/install.sh --from=/path/to/agent-kit

set -euo pipefail

DEFAULT_REPO="jamie-l-robertson/agent-kit"
DEFAULT_REF="main"

REPO="${AGENT_KIT_REPO:-$DEFAULT_REPO}"
REF="${AGENT_KIT_REF:-$DEFAULT_REF}"
FROM=""

for arg in "$@"; do
  case "$arg" in
    --from=*) FROM="${arg#--from=}" ;;
    --force) export AGENT_KIT_FORCE=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "error: tar is required" >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/agent-kit-install.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

if [[ -n "$FROM" ]]; then
  KIT_ROOT="$(cd "$FROM" && pwd)"
else
  # Prefer running the install.mjs from the downloaded kit so script stays in sync.
  echo "Downloading ${REPO}@${REF} …"
  ARCHIVE="$TMP/kit.tar.gz"
  if ! curl -fsSL "https://codeload.github.com/${REPO}/tar.gz/${REF}" -o "$ARCHIVE"; then
    echo "error: download failed. Is ${REPO}@${REF} published on GitHub?" >&2
    exit 1
  fi
  tar -xzf "$ARCHIVE" -C "$TMP"
  KIT_ROOT="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi

export AGENT_KIT_REPO="$REPO"
export AGENT_KIT_REF="$REF"
# Force the node installer to use this tree (not a second download)
node "$KIT_ROOT/scripts/install.mjs" --from="$KIT_ROOT" ${AGENT_KIT_FORCE:+--force}
