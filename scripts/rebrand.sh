#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./brand-map.sh
source "$SCRIPT_DIR/brand-map.sh"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

if [[ $# -ne 0 ]]; then
  echo "Usage: $0 [--dry-run]" >&2
  exit 1
fi

FILES_CHANGED=0
CASE_REPLACEMENTS=0
PATH_REPLACEMENTS=0
URL_REPLACEMENTS=0
ATTR_REPLACEMENTS=0
VOICE_REPLACEMENTS=0

PHASE2_STATE_TOKEN="__REBRAND_PHASE2_STATE__"
PHASE2_PATH_TOKEN="__REBRAND_PHASE2_PATH__"
PHASE3_URL_TOKEN="__REBRAND_PHASE3_URL__"
PHASE4_ATTR_TOKEN="__REBRAND_PHASE4_ATTR__"

PATH_SEGMENT_OLD="/$OLD_BRAND/"
PATH_SEGMENT_NEW="/$NEW_BRAND/"
ENV_PREFIX_OLD="${OLD_ENV_PREFIX}_"
ENV_PREFIX_NEW="${NEW_ENV_PREFIX}_"

camel_to_words_lower() {
  printf '%s' "$1" \
    | sed -E 's/([A-Z])([A-Z][a-z])/\1 \2/g; s/([a-z0-9])([A-Z])/\1 \2/g' \
    | tr '[:upper:]' '[:lower:]'
}

spell_leading_initial() {
  local phrase="$1"
  local first="${phrase%% *}"
  local rest=""

  if [[ "$phrase" == *" "* ]]; then
    rest="${phrase#* }"
  fi

  if [[ ${#first} -ne 1 ]]; then
    printf '%s' "$phrase"
    return
  fi

  case "$first" in
    a) first="ay" ;;
    b) first="bee" ;;
    c) first="see" ;;
    d) first="dee" ;;
    e) first="ee" ;;
    f) first="eff" ;;
    g) first="gee" ;;
    h) first="aitch" ;;
    i) first="eye" ;;
    j) first="jay" ;;
    k) first="kay" ;;
    l) first="ell" ;;
    m) first="em" ;;
    n) first="en" ;;
    o) first="oh" ;;
    p) first="pee" ;;
    q) first="cue" ;;
    r) first="ar" ;;
    s) first="ess" ;;
    t) first="tee" ;;
    u) first="you" ;;
    v) first="vee" ;;
    w) first="double you" ;;
    x) first="ex" ;;
    y) first="why" ;;
    z) first="zee" ;;
    *)
      printf '%s' "$phrase"
      return
      ;;
  esac

  if [[ -n "$rest" ]]; then
    printf '%s %s' "$first" "$rest"
  else
    printf '%s' "$first"
  fi
}

VOICE_TRIGGER_OLD="$(camel_to_words_lower "$OLD_DISPLAY")"
VOICE_TRIGGER_NEW="$(camel_to_words_lower "$NEW_DISPLAY")"
VOICE_TRIGGER_OLD_SPOKEN="$(spell_leading_initial "$VOICE_TRIGGER_OLD")"

escape_sed_pattern() {
  printf '%s' "$1" | sed -E 's/[][\\/.^$*+?(){}|]/\\&/g'
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -E 's/[\\&|]/\\&/g'
}

count_literal() {
  local needle="$1"
  local file="$2"

  awk -v needle="$needle" '
    BEGIN {
      count = 0
      len = length(needle)
    }
    {
      line = $0
      while (len > 0) {
        idx = index(line, needle)
        if (idx == 0) {
          break
        }
        count++
        line = substr(line, idx + len)
      }
    }
    END {
      print count
    }
  ' "$file"
}

replace_literal_in_place() {
  local file="$1"
  local old_value="$2"
  local new_value="$3"
  local escaped_old
  local escaped_new

  escaped_old="$(escape_sed_pattern "$old_value")"
  escaped_new="$(escape_sed_replacement "$new_value")"
  sed -E -i '' -e "s|$escaped_old|$escaped_new|g" "$file"
}

collect_target_files() {
  find . \
    \( -name .git -o -name node_modules \) -type d -prune -o \
    -type f \
    \( -name '*.tmpl' -o -name '*.ts' -o -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.yaml' \) \
    ! -name 'bun.lock' \
    ! -name 'SKILL.md' \
    ! -path './scripts/brand-map.sh' \
    ! -path './scripts/rebrand.sh' \
    -print0
}

print_file_report() {
  local file="$1"
  local case_count="$2"
  local path_count="$3"
  local url_count="$4"
  local attr_count="$5"
  local voice_count="$6"

  if (( DRY_RUN )); then
    printf '[dry-run] %s case=%d path=%d url=%d attr=%d voice=%d\n' \
      "$file" "$case_count" "$path_count" "$url_count" "$attr_count" "$voice_count"
  else
    printf '[updated] %s case=%d path=%d url=%d attr=%d voice=%d\n' \
      "$file" "$case_count" "$path_count" "$url_count" "$attr_count" "$voice_count"
  fi
}

process_standard_file() {
  local file="$1"
  local working
  local case_count=0
  local path_count=0
  local url_count=0
  local attr_count=0
  local voice_count=0

  working="$(mktemp)"
  cp "$file" "$working"

  url_count=$((url_count + $(count_literal "$OLD_GITHUB" "$working")))
  replace_literal_in_place "$working" "$OLD_GITHUB" "$PHASE3_URL_TOKEN"

  attr_count=$((attr_count + $(count_literal "$OLD_ATTR_TAG" "$working")))
  replace_literal_in_place "$working" "$OLD_ATTR_TAG" "$PHASE4_ATTR_TOKEN"

  path_count=$((path_count + $(count_literal "$OLD_STATE_DIR" "$working")))
  replace_literal_in_place "$working" "$OLD_STATE_DIR" "$PHASE2_STATE_TOKEN"

  path_count=$((path_count + $(count_literal "$PATH_SEGMENT_OLD" "$working")))
  replace_literal_in_place "$working" "$PATH_SEGMENT_OLD" "$PHASE2_PATH_TOKEN"

  case_count=$((case_count + $(count_literal "$ENV_PREFIX_OLD" "$working")))
  case_count=$((case_count + $(count_literal "$OLD_DISPLAY" "$working")))
  case_count=$((case_count + $(count_literal "$OLD_BRAND" "$working")))

  replace_literal_in_place "$working" "$ENV_PREFIX_OLD" "$ENV_PREFIX_NEW"
  replace_literal_in_place "$working" "$OLD_DISPLAY" "$NEW_DISPLAY"
  replace_literal_in_place "$working" "$OLD_BRAND" "$NEW_BRAND"

  replace_literal_in_place "$working" "$PHASE2_STATE_TOKEN" "$NEW_STATE_DIR"
  replace_literal_in_place "$working" "$PHASE2_PATH_TOKEN" "$PATH_SEGMENT_NEW"

  replace_literal_in_place "$working" "$PHASE3_URL_TOKEN" "$NEW_GITHUB"
  replace_literal_in_place "$working" "$PHASE4_ATTR_TOKEN" "$NEW_ATTR_TAG"

  voice_count=$((voice_count + $(count_literal "$VOICE_TRIGGER_OLD_SPOKEN" "$working")))
  replace_literal_in_place "$working" "$VOICE_TRIGGER_OLD_SPOKEN" "$VOICE_TRIGGER_NEW"

  voice_count=$((voice_count + $(count_literal "$VOICE_TRIGGER_OLD" "$working")))
  replace_literal_in_place "$working" "$VOICE_TRIGGER_OLD" "$VOICE_TRIGGER_NEW"

  if ! cmp -s "$file" "$working"; then
    FILES_CHANGED=$((FILES_CHANGED + 1))
    CASE_REPLACEMENTS=$((CASE_REPLACEMENTS + case_count))
    PATH_REPLACEMENTS=$((PATH_REPLACEMENTS + path_count))
    URL_REPLACEMENTS=$((URL_REPLACEMENTS + url_count))
    ATTR_REPLACEMENTS=$((ATTR_REPLACEMENTS + attr_count))
    VOICE_REPLACEMENTS=$((VOICE_REPLACEMENTS + voice_count))

    print_file_report "$file" "$case_count" "$path_count" "$url_count" "$attr_count" "$voice_count"

    if (( ! DRY_RUN )); then
      cat "$working" > "$file"
    fi
  fi

  rm -f "$working"
}

process_changelog_file() {
  local file="$1"
  local working
  local url_count=0

  working="$(mktemp)"
  cp "$file" "$working"

  url_count=$((url_count + $(count_literal "$OLD_GITHUB" "$working")))
  replace_literal_in_place "$working" "$OLD_GITHUB" "$NEW_GITHUB"

  if ! cmp -s "$file" "$working"; then
    FILES_CHANGED=$((FILES_CHANGED + 1))
    URL_REPLACEMENTS=$((URL_REPLACEMENTS + url_count))

    print_file_report "$file" 0 0 "$url_count" 0 0

    if (( ! DRY_RUN )); then
      cat "$working" > "$file"
    fi
  fi

  rm -f "$working"
}

while IFS= read -r -d '' file; do
  if [[ "$file" == "./CHANGELOG.md" ]]; then
    process_changelog_file "$file"
  else
    process_standard_file "$file"
  fi
done < <(collect_target_files)

echo
if (( DRY_RUN )); then
  echo 'Dry run complete.'
else
  echo 'Rebrand complete.'
fi
printf 'Files changed: %d\n' "$FILES_CHANGED"
printf 'Case-sensitive replacements: %d\n' "$CASE_REPLACEMENTS"
printf 'Path replacements: %d\n' "$PATH_REPLACEMENTS"
printf 'URL replacements: %d\n' "$URL_REPLACEMENTS"
printf 'Attribution replacements: %d\n' "$ATTR_REPLACEMENTS"
printf 'Voice trigger replacements: %d\n' "$VOICE_REPLACEMENTS"
