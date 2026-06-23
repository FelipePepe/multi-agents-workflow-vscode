#!/usr/bin/env bash
# Run: chmod +x .ai-workflows/scripts/*.sh first
# ollama-check-models.sh — Checks required Ollama models are available locally.
# Usage: ./ollama-check-models.sh [--pull]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
LOG_DIR="${WORKSPACE_ROOT}/.ai-workflows/logs"
CONFIG_FILE="${WORKSPACE_ROOT}/.ai-workflows/config/models.json"

PULL_MISSING=false
if [[ "${1:-}" == "--pull" ]]; then
  PULL_MISSING=true
fi

mkdir -p "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Required models — read from config if available, else hardcoded defaults
# ---------------------------------------------------------------------------

declare -a REQUIRED_MODELS

if command -v jq &>/dev/null && [[ -f "${CONFIG_FILE}" ]]; then
  mapfile -t REQUIRED_MODELS < <(jq -r '.required_models[]' "${CONFIG_FILE}" 2>/dev/null || true)
  if [[ ${#REQUIRED_MODELS[@]} -eq 0 ]]; then
    echo "[ollama-check] WARN: Could not parse models from ${CONFIG_FILE}. Using hardcoded defaults." >&2
  fi
fi

if [[ ${#REQUIRED_MODELS[@]} -eq 0 ]]; then
  REQUIRED_MODELS=(
    "qwen3.6:35b-a3b"
    "qwen3-coder-next"
    "deepseek-r1:70b"
    "devstral-small-2"
    "north-mini-code-1.0"
    "qwen2.5-coder:32b"
  )
fi

# ---------------------------------------------------------------------------
# Check ollama is installed
# ---------------------------------------------------------------------------

if ! command -v ollama &>/dev/null; then
  echo ""
  echo "ERROR: ollama is not installed or not in PATH." >&2
  echo "" >&2
  echo "Installation instructions:" >&2
  echo "  Linux/macOS : curl -fsSL https://ollama.com/install.sh | sh" >&2
  echo "  Windows     : https://ollama.com/download/windows" >&2
  echo "  Manual      : https://ollama.com/download" >&2
  echo "" >&2
  exit 1
fi

echo ""
echo "=== Ollama Model Check ==="
echo "Required models: ${#REQUIRED_MODELS[@]}"
echo ""

# ---------------------------------------------------------------------------
# Get currently available models
# ---------------------------------------------------------------------------

OLLAMA_LIST_OUTPUT="$(ollama list 2>/dev/null || true)"

# ---------------------------------------------------------------------------
# Check each model
# ---------------------------------------------------------------------------

PRESENT=()
MISSING=()

for model in "${REQUIRED_MODELS[@]}"; do
  # Match model name — ollama list output format: "model:tag  ID  SIZE  MODIFIED"
  # We strip the tag from the search key to allow flexible matching
  model_name="${model%%:*}"
  model_tag="${model#*:}"

  if [[ "${model_name}" == "${model_tag}" ]]; then
    # No tag specified — match any tag for this model name
    if echo "${OLLAMA_LIST_OUTPUT}" | grep -qE "^${model_name}(:[^ ]+)?[[:space:]]"; then
      PRESENT+=("${model}")
      echo "  [OK]      ${model}"
    else
      MISSING+=("${model}")
      echo "  [MISSING] ${model}"
    fi
  else
    # Exact tag match
    if echo "${OLLAMA_LIST_OUTPUT}" | grep -qE "^${model_name}:${model_tag}[[:space:]]"; then
      PRESENT+=("${model}")
      echo "  [OK]      ${model}"
    else
      MISSING+=("${model}")
      echo "  [MISSING] ${model}"
    fi
  fi
done

echo ""

# ---------------------------------------------------------------------------
# Handle missing models
# ---------------------------------------------------------------------------

if [[ ${#MISSING[@]} -gt 0 ]]; then
  if [[ "${PULL_MISSING}" == true ]]; then
    echo "Pulling ${#MISSING[@]} missing model(s)..."
    echo ""
    PULL_FAILURES=()
    for model in "${MISSING[@]}"; do
      echo "  Pulling: ${model}"
      if ollama pull "${model}"; then
        echo "  [OK] ${model} pulled successfully."
      else
        echo "  [ERROR] Failed to pull ${model}." >&2
        PULL_FAILURES+=("${model}")
      fi
      echo ""
    done
    if [[ ${#PULL_FAILURES[@]} -gt 0 ]]; then
      echo "ERROR: Failed to pull ${#PULL_FAILURES[@]} model(s):" >&2
      for m in "${PULL_FAILURES[@]}"; do
        echo "  - ${m}" >&2
      done
      echo ""
    fi
  else
    echo "To pull the missing models, run:"
    echo ""
    for model in "${MISSING[@]}"; do
      echo "  ollama pull ${model}"
    done
    echo ""
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

TOTAL=${#REQUIRED_MODELS[@]}
PRESENT_COUNT=${#PRESENT[@]}

echo "=== Summary ==="
echo "  ${PRESENT_COUNT}/${TOTAL} models available"
echo ""

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "  Missing models:"
  for m in "${MISSING[@]}"; do
    echo "    - ${m}"
  done
  echo ""
  exit 1
fi

echo "All required models are available."
echo ""
exit 0
