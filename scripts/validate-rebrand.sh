#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TOTAL_CHECKS=8
PASS_COUNT=0
FAILED_CHECKS=()

LEGACY_TOKEN="g""stack"
LEGACY_PREFIX="${LEGACY_TOKEN}-"
LEGACY_ENV_PREFIX="G""STACK_"
LEGACY_HOME_PATH="~/.g""stack/"
LEGACY_REPO_URL="garrytan/g""stack"
DOUBLE_PREFIX_TOKEN="ohmystack-""ohmystack-"
ORIGINAL_BRAND="G""Stack"
ATTRIBUTION_FILTER="OhMyStack[[:space:]]*\\(based on ${ORIGINAL_BRAND}|attribution"

EXPECTED_BINS=(
  "ohmystack-analytics"
  "ohmystack-builder-profile"
  "ohmystack-community-dashboard"
  "ohmystack-config"
  "ohmystack-diff-scope"
  "ohmystack-extension"
  "ohmystack-global-discover.ts"
  "ohmystack-learnings-log"
  "ohmystack-learnings-search"
  "ohmystack-open-url"
  "ohmystack-patch-names"
  "ohmystack-platform-detect"
  "ohmystack-relink"
  "ohmystack-repo-mode"
  "ohmystack-review-log"
  "ohmystack-review-read"
  "ohmystack-slug"
  "ohmystack-specialist-stats"
  "ohmystack-telemetry-log"
  "ohmystack-telemetry-sync"
  "ohmystack-timeline-log"
  "ohmystack-timeline-read"
  "ohmystack-uninstall"
  "ohmystack-update-check"
)

print_details() {
  local details="${1:-}"

  [ -z "$details" ] && return 0

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    printf '    %s\n' "$line"
  done <<< "$details"
}

record_pass() {
  local label="$1"
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS - %s\n' "$label"
}

record_fail() {
  local label="$1"
  local details="${2:-}"
  FAILED_CHECKS+=("$label")
  printf 'FAIL - %s\n' "$label"
  print_details "$details"
}

search_all() {
  local pattern="$1"

  grep -rniI \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude-dir=.sisyphus \
    --exclude=bun.lock \
    --exclude=SKILL.md \
    -- "$pattern" "$ROOT" 2>/dev/null || true
}

search_tmpl() {
  local pattern="$1"

  grep -rniI \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --include='*.tmpl' \
    -- "$pattern" "$ROOT" 2>/dev/null || true
}

search_tmpl_and_ts() {
  local pattern="$1"

  grep -rniI \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude=SKILL.md \
    --include='*.tmpl' \
    --include='*.ts' \
    -- "$pattern" "$ROOT" 2>/dev/null || true
}

filter_attribution_lines() {
  local input="${1:-}"

  if [ -z "$input" ]; then
    return 0
  fi

  printf '%s\n' "$input" | grep -viE "$ATTRIBUTION_FILTER" || true
}

printf 'Validating OhMyStack rebrand in %s\n\n' "$ROOT"

# Check 1
zero_ref_results="$(filter_attribution_lines "$(search_all "$LEGACY_TOKEN")")"
if [ -z "$zero_ref_results" ]; then
  record_pass "Check 1: Zero-ref check"
else
  record_fail "Check 1: Zero-ref check" "$zero_ref_results"
fi

# Check 2
bin_tool_issues=""
for tool in "${EXPECTED_BINS[@]}"; do
  path="$ROOT/bin/$tool"
  if [ ! -e "$path" ]; then
    bin_tool_issues="${bin_tool_issues}${bin_tool_issues:+$'\n'}$path (missing)"
  elif [ ! -x "$path" ]; then
    bin_tool_issues="${bin_tool_issues}${bin_tool_issues:+$'\n'}$path (not executable)"
  fi
done

if [ -z "$bin_tool_issues" ]; then
  record_pass "Check 2: Bin tool check"
else
  record_fail "Check 2: Bin tool check" "$bin_tool_issues"
fi

# Check 3
shopt -s nullglob
legacy_bins=("$ROOT"/bin/${LEGACY_PREFIX}*)
shopt -u nullglob

legacy_bin_issues=""
for path in "${legacy_bins[@]}"; do
  tool="$(basename "$path")"
  case "$tool" in
    "${LEGACY_PREFIX}team-init"|"${LEGACY_PREFIX}settings-hook"|"${LEGACY_PREFIX}session-update")
      ;;
    *)
      legacy_bin_issues="${legacy_bin_issues}${legacy_bin_issues:+$'\n'}$path"
      ;;
  esac
done

if [ -z "$legacy_bin_issues" ]; then
  record_pass "Check 3: No old bin tools"
else
  record_fail "Check 3: No old bin tools" "$legacy_bin_issues"
fi

# Check 4
tmpl_legacy_results="$(filter_attribution_lines "$(search_tmpl "$LEGACY_TOKEN")")"
if [ -z "$tmpl_legacy_results" ]; then
  record_pass "Check 4: Template consistency"
else
  record_fail "Check 4: Template consistency" "$tmpl_legacy_results"
fi

# Check 5
env_var_results="$(search_tmpl_and_ts "$LEGACY_ENV_PREFIX")"
if [ -z "$env_var_results" ]; then
  record_pass "Check 5: Env var check"
else
  record_fail "Check 5: Env var check" "$env_var_results"
fi

# Check 6
path_results="$(search_tmpl "$LEGACY_HOME_PATH")"
if [ -z "$path_results" ]; then
  record_pass "Check 6: Path check"
else
  record_fail "Check 6: Path check" "$path_results"
fi

# Check 7
url_results="$(search_all "$LEGACY_REPO_URL")"
if [ -z "$url_results" ]; then
  record_pass "Check 7: URL check"
else
  record_fail "Check 7: URL check" "$url_results"
fi

# Check 8
double_prefix_results="$(search_all "$DOUBLE_PREFIX_TOKEN")"
if [ -z "$double_prefix_results" ]; then
  record_pass "Check 8: Double-prefix check"
else
  record_fail "Check 8: Double-prefix check" "$double_prefix_results"
fi

printf '\nSummary: %d/%d checks passed.\n' "$PASS_COUNT" "$TOTAL_CHECKS"

if [ "${#FAILED_CHECKS[@]}" -eq 0 ]; then
  printf 'All rebrand checks passed.\n'
  exit 0
fi

printf 'Failed checks (%d):\n' "${#FAILED_CHECKS[@]}"
for check in "${FAILED_CHECKS[@]}"; do
  printf '  - %s\n' "$check"
done

exit 1
