#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SKILLS=(
  "plan-ceo-review"
  "plan-eng-review"
  "plan-design-review"
  "plan-devex-review"
  "office-hours"
  "investigate"
  "cso"
  "review"
  "design-review"
  "health"
  "qa"
  "qa-only"
  "benchmark"
  "devex-review"
  "ship"
  "retro"
  "document-release"
  "autoplan"
  "land-and-deploy"
  "canary"
  "design-consultation"
  "design-html"
  "design-shotgun"
  "learn"
)

PASS_COUNT=0
FAILED_SKILLS=()

record_pass() {
  local label="$1"
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS - %s\n' "$label"
}

record_fail() {
  local label="$1"
  local details="$2"
  FAILED_SKILLS+=("$label")
  printf 'FAIL - %s\n' "$label"
  printf '    %s\n' "$details"
}

printf 'Validating OMO agent dispatch patterns in %s\n\n' "$ROOT"

for skill in "${SKILLS[@]}"; do
  template="$ROOT/$skill/SKILL.md.tmpl"

  if [ ! -f "$template" ]; then
    record_fail "$skill" "$template (missing)"
    continue
  fi

  if grep -nE 'subagent_type|task\(' "$template" >/dev/null 2>&1; then
    record_pass "$skill"
  else
    record_fail "$skill" "$template (missing subagent_type/task() dispatch pattern)"
  fi
done

printf '\nSummary: %d/%d skills passed.\n' "$PASS_COUNT" "${#SKILLS[@]}"

if [ "${#FAILED_SKILLS[@]}" -eq 0 ]; then
  printf 'All dispatch checks passed.\n'
  exit 0
fi

printf 'Failed skills (%d):\n' "${#FAILED_SKILLS[@]}"
for skill in "${FAILED_SKILLS[@]}"; do
  printf '  - %s\n' "$skill"
done

exit 1
