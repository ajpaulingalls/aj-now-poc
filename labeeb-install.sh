#!/bin/bash
# labeeb-install: bind-mount node_modules (root + workspaces) onto fast overlay
# storage, then run the requested package manager. Solves CIFS symlink limits.
#
# Usage:
#   labeeb-install                    # cd into project, run; defaults to `bun install`
#   labeeb-install bun add lodash     # pass-through to bun/pnpm/npm/yarn
#   labeeb-install --unmount          # tear down bind mounts for current project
#   labeeb-install --unmount-all      # tear down ALL labeeb bind mounts
#   labeeb-install --status           # show active bind mounts
#   labeeb-install --help
set -e

CACHE_ROOT="${LABEEB_NM_CACHE:-/var/cache/labeeb/nm}"
proj="$(pwd)"

resolve_bun() {
  local bun_bin=""
  bun_bin="$(command -v bun 2>/dev/null || true)"
  if [[ -z "$bun_bin" && -x "$HOME/.bun/bin/bun" ]]; then
    bun_bin="$HOME/.bun/bin/bun"
  fi
  printf '%s\n' "$bun_bin"
}

export_bun_path() {
  local bun_bin="$1"
  if [[ -n "$bun_bin" ]]; then
    # Make Bun visible to child shell scripts invoked by `bun run`, not just
    # this wrapper's final exec. Fresh containers often have Bun installed
    # under ~/.bun/bin without that directory on PATH.
    export PATH="$(dirname "$bun_bin"):$PATH"
  fi
}

ensure_bun() {
  local bun_bin
  bun_bin="$(resolve_bun)"
  if [[ -n "$bun_bin" ]]; then
    export_bun_path "$bun_bin"
    printf '%s\n' "$bun_bin"
    return 0
  fi

  echo "[labeeb-install] Bun not found; installing to $HOME/.bun ..." >&2
  if ! command -v curl >/dev/null 2>&1; then
    echo "[labeeb-install] ERROR: curl is required to install Bun" >&2
    return 1
  fi
  curl -fsSL https://bun.sh/install | bash >&2

  bun_bin="$(resolve_bun)"
  if [[ -z "$bun_bin" ]]; then
    echo "[labeeb-install] ERROR: Bun install completed, but bun was not found" >&2
    return 1
  fi
  export_bun_path "$bun_bin"
  printf '%s\n' "$bun_bin"
}


usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

list_mounts() {
  mount | grep -E "on .+/node_modules type " | grep "$CACHE_ROOT" || echo "(none)"
}

unmount_dir() {
  local nm="$1/node_modules"
  if mountpoint -q "$nm" 2>/dev/null; then
    umount "$nm" && echo "[labeeb-install] unmounted $nm"
  fi
}

unmount_project() {
  unmount_dir "$proj"
  if [[ -f "$proj/package.json" ]]; then
    local globs
    globs=$(node -e '
      try {
        const p = require("'"$proj"'/package.json");
        let ws = p.workspaces || [];
        if (!Array.isArray(ws)) ws = ws.packages || [];
        console.log(ws.join("\n"));
      } catch(e) {}
    ' 2>/dev/null)
    while IFS= read -r glob; do
      [[ -z "$glob" ]] && continue
      for ws_dir in $proj/$glob; do
        [[ -d "$ws_dir" ]] && unmount_dir "$ws_dir"
      done
    done <<< "$globs"
  fi
}

unmount_all() {
  # Reverse order so nested mounts come off first
  mount | grep -E "on .+/node_modules type " | grep "$CACHE_ROOT" \
    | awk '{print $3}' | tac | while read -r nm; do
    umount "$nm" && echo "[labeeb-install] unmounted $nm"
  done
}

case "${1:-}" in
  -h|--help) usage ;;
  --status) list_mounts; exit 0 ;;
  --unmount) unmount_project; exit 0 ;;
  --unmount-all) unmount_all; exit 0 ;;
esac

fstype=$(stat -f -c %T "$proj" 2>/dev/null || echo unknown)
needs_bind=false
[[ "$fstype" == "smb2" || "$fstype" == "cifs" ]] && needs_bind=true

bind_nm() {
  local dir="$1"
  local rel="${dir#/}"
  local cache="$CACHE_ROOT/$rel/node_modules"
  local nm="$dir/node_modules"
  mkdir -p "$cache" "$nm"
  if ! mountpoint -q "$nm"; then
    mount --bind "$cache" "$nm"
    echo "[labeeb-install] bound $nm -> $cache"
  fi
}

if $needs_bind; then
  bind_nm "$proj"
  if [[ -f "$proj/package.json" ]]; then
    globs=$(node -e '
      try {
        const p = require("'"$proj"'/package.json");
        let ws = p.workspaces || [];
        if (!Array.isArray(ws)) ws = ws.packages || [];
        console.log(ws.join("\n"));
      } catch(e) {}
    ' 2>/dev/null)
    if [[ -n "$globs" ]]; then
      while IFS= read -r glob; do
        [[ -z "$glob" ]] && continue
        for ws_dir in $proj/$glob; do
          [[ -d "$ws_dir" && -f "$ws_dir/package.json" ]] || continue
          bind_nm "$ws_dir"
        done
      done <<< "$globs"
    fi
  fi
else
  echo "[labeeb-install] $proj is on $fstype — no bind needed"
fi

if [[ $# -eq 0 ]]; then
  BUN_BIN="$(ensure_bun)"
  export PATH="$(dirname "$BUN_BIN"):$PATH"
  exec "$BUN_BIN" install
elif [[ "$1" == "bun" ]]; then
  BUN_BIN="$(ensure_bun)"
  export PATH="$(dirname "$BUN_BIN"):$PATH"
  shift
  exec "$BUN_BIN" "$@"
elif [[ "$1" == "pnpm" || "$1" == "npm" || "$1" == "yarn" ]]; then
  PATH="$HOME/.bun/bin:$PATH" exec "$@"
else
  BUN_BIN="$(ensure_bun)"
  export PATH="$(dirname "$BUN_BIN"):$PATH"
  exec "$BUN_BIN" install "$@"
fi
