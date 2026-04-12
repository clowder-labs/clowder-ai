#!/usr/bin/env bash

# Shared download source override helpers for Bash install/start scripts.
# Manual overrides are still honored first; pip install helpers add safe retries
# and optional fallback indexes for poor-network environments.

ARG_OFFICE_CLAW_NPM_REGISTRY="${ARG_OFFICE_CLAW_NPM_REGISTRY:-}"
ARG_OFFICE_CLAW_PIP_INDEX_URL="${ARG_OFFICE_CLAW_PIP_INDEX_URL:-}"
ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL="${ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}"
ARG_OFFICE_CLAW_HF_ENDPOINT="${ARG_OFFICE_CLAW_HF_ENDPOINT:-}"

parse_manual_download_source_arg() {
  case "${1:-}" in
    --npm-registry=*)
      ARG_OFFICE_CLAW_NPM_REGISTRY="${1#*=}"
      return 0
      ;;
    --pip-index-url=*)
      ARG_OFFICE_CLAW_PIP_INDEX_URL="${1#*=}"
      return 0
      ;;
    --pip-extra-index-url=*)
      ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL="${1#*=}"
      return 0
      ;;
    --hf-endpoint=*)
      ARG_OFFICE_CLAW_HF_ENDPOINT="${1#*=}"
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

apply_manual_download_source_overrides() {
  if [ -n "${ARG_OFFICE_CLAW_NPM_REGISTRY:-}" ]; then
    OFFICE_CLAW_NPM_REGISTRY="${ARG_OFFICE_CLAW_NPM_REGISTRY}"
  fi
  if [ -n "${ARG_OFFICE_CLAW_PIP_INDEX_URL:-}" ]; then
    OFFICE_CLAW_PIP_INDEX_URL="${ARG_OFFICE_CLAW_PIP_INDEX_URL}"
  fi
  if [ -n "${ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}" ]; then
    OFFICE_CLAW_PIP_EXTRA_INDEX_URL="${ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL}"
  fi
  if [ -n "${ARG_OFFICE_CLAW_HF_ENDPOINT:-}" ]; then
    OFFICE_CLAW_HF_ENDPOINT="${ARG_OFFICE_CLAW_HF_ENDPOINT}"
  fi

  if [ -n "${OFFICE_CLAW_NPM_REGISTRY:-}" ]; then
    export OFFICE_CLAW_NPM_REGISTRY
    export NPM_CONFIG_REGISTRY="${OFFICE_CLAW_NPM_REGISTRY}"
  fi
  if [ -n "${OFFICE_CLAW_PIP_INDEX_URL:-}" ]; then
    export OFFICE_CLAW_PIP_INDEX_URL
    export PIP_INDEX_URL="${OFFICE_CLAW_PIP_INDEX_URL}"
  fi
  if [ -n "${OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}" ]; then
    export OFFICE_CLAW_PIP_EXTRA_INDEX_URL
    export PIP_EXTRA_INDEX_URL="${OFFICE_CLAW_PIP_EXTRA_INDEX_URL}"
  fi
  if [ -n "${OFFICE_CLAW_HF_ENDPOINT:-}" ]; then
    export OFFICE_CLAW_HF_ENDPOINT
    export HF_ENDPOINT="${OFFICE_CLAW_HF_ENDPOINT}"
  fi
}

print_manual_download_source_summary() {
  [ -n "${OFFICE_CLAW_NPM_REGISTRY:-}" ] && echo "  手动镜像: npm registry=$OFFICE_CLAW_NPM_REGISTRY"
  [ -n "${OFFICE_CLAW_PIP_INDEX_URL:-}" ] && echo "  手动镜像: pip index=$OFFICE_CLAW_PIP_INDEX_URL"
  [ -n "${OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}" ] && echo "  手动镜像: pip extra-index=$OFFICE_CLAW_PIP_EXTRA_INDEX_URL"
  [ -n "${OFFICE_CLAW_HF_ENDPOINT:-}" ] && echo "  手动镜像: hf endpoint=$OFFICE_CLAW_HF_ENDPOINT"
  true
}

# pip installation helpers
#
# CAT_CAFE_PIP_TIMEOUT_SECONDS        (default: 120)
# CAT_CAFE_PIP_RETRIES                (default: 2)
# CAT_CAFE_PIP_AUTO_FALLBACK_INDEXES  (default: 1)
# CAT_CAFE_PIP_FALLBACK_INDEX_URLS    (comma/space separated list)

cat_cafe_trim_spaces() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

cat_cafe_array_contains() {
  local needle="$1"
  shift
  local item=""
  for item in "$@"; do
    [ "$item" = "$needle" ] && return 0
  done
  return 1
}

collect_pip_index_candidates() {
  local fallback_enabled="${CAT_CAFE_PIP_AUTO_FALLBACK_INDEXES:-1}"
  local fallback_urls="${CAT_CAFE_PIP_FALLBACK_INDEX_URLS:-https://pypi.org/simple,https://pypi.tuna.tsinghua.edu.cn/simple,https://mirrors.aliyun.com/pypi/simple,https://pypi.mirrors.ustc.edu.cn/simple}"
  local -a candidates=()
  local candidate=""

  if [ -n "${CAT_CAFE_PIP_INDEX_URL:-}" ]; then
    candidates+=("${CAT_CAFE_PIP_INDEX_URL}")
  fi

  if [ "$fallback_enabled" != "0" ]; then
    while IFS= read -r candidate || [ -n "$candidate" ]; do
      candidate="$(cat_cafe_trim_spaces "$candidate")"
      [ -z "$candidate" ] && continue
      if ! cat_cafe_array_contains "$candidate" "${candidates[@]}"; then
        candidates+=("$candidate")
      fi
    done < <(printf '%s\n' "$fallback_urls" | tr ',; ' '\n')
  fi

  if [ "${#candidates[@]}" -eq 0 ]; then
    return 0
  fi

  printf '%s\n' "${candidates[@]}"
}

cat_cafe_pip_install() {
  local pip_bin="${1:-pip}"
  shift || true

  if [ "$#" -eq 0 ]; then
    echo "[pip] no packages specified" >&2
    return 2
  fi

  local timeout_seconds="${CAT_CAFE_PIP_TIMEOUT_SECONDS:-120}"
  local retries="${CAT_CAFE_PIP_RETRIES:-2}"
  local primary_extra_index="${CAT_CAFE_PIP_EXTRA_INDEX_URL:-}"
  local official_index="https://pypi.org/simple"
  local -a index_candidates=()
  local index_url=""
  local install_rc=1
  local run_rc=1

  while IFS= read -r index_url; do
    [ -n "$index_url" ] && index_candidates+=("$index_url")
  done < <(collect_pip_index_candidates)

  if [ "${#index_candidates[@]}" -eq 0 ]; then
    "$pip_bin" install \
      --disable-pip-version-check \
      --no-warn-script-location \
      --timeout "$timeout_seconds" \
      --retries "$retries" \
      "$@"
    return $?
  fi

  local attempt=0
  for index_url in "${index_candidates[@]}"; do
    attempt=$((attempt + 1))
    echo "  [pip] attempt $attempt/${#index_candidates[@]} index: $index_url"
    run_rc=1

    if [ -n "$primary_extra_index" ]; then
      if PIP_INDEX_URL="$index_url" PIP_EXTRA_INDEX_URL="$primary_extra_index" \
        "$pip_bin" install \
          --disable-pip-version-check \
          --no-warn-script-location \
          --timeout "$timeout_seconds" \
          --retries "$retries" \
          "$@"; then
        run_rc=0
      else
        run_rc=$?
      fi
    elif [ "$index_url" != "$official_index" ]; then
      if PIP_INDEX_URL="$index_url" PIP_EXTRA_INDEX_URL="$official_index" \
        "$pip_bin" install \
          --disable-pip-version-check \
          --no-warn-script-location \
          --timeout "$timeout_seconds" \
          --retries "$retries" \
          "$@"; then
        run_rc=0
      else
        run_rc=$?
      fi
    else
      if PIP_INDEX_URL="$index_url" \
        "$pip_bin" install \
          --disable-pip-version-check \
          --no-warn-script-location \
          --timeout "$timeout_seconds" \
          --retries "$retries" \
          "$@"; then
        run_rc=0
      else
        run_rc=$?
      fi
    fi

    if [ "$run_rc" -eq 0 ]; then
      return 0
    fi

    install_rc=$run_rc
  done

  return "$install_rc"
}
