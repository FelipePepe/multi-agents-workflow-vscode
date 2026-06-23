#!/usr/bin/env bash
# Run: chmod +x .ai-workflows/scripts/*.sh first
# run-build.sh — Runs the build command detected for this project stack.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
LOG_DIR="${WORKSPACE_ROOT}/.ai-workflows/logs"
BUILD_LOG="${LOG_DIR}/build.log"
DETECT_SCRIPT="${SCRIPT_DIR}/detect-stack.sh"

mkdir -p "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[run-build] $*"; }

# ---------------------------------------------------------------------------
# Run stack detection
# ---------------------------------------------------------------------------

if [[ ! -f "${DETECT_SCRIPT}" ]]; then
  echo "[run-build] ERROR: detect-stack.sh not found at ${DETECT_SCRIPT}" >&2
  exit 1
fi

log "Running stack detection..."
STACK_JSON="$("${DETECT_SCRIPT}")"

# ---------------------------------------------------------------------------
# Parse JSON — prefer jq, fall back to grep/sed
# ---------------------------------------------------------------------------

if command -v jq &>/dev/null; then
  PRIMARY="$(echo "${STACK_JSON}" | jq -r '.primary')"
  BUILD_CMD="$(echo "${STACK_JSON}" | jq -r '.build_cmd')"
  MARKER_LOOKUP="$(echo "${STACK_JSON}" | jq -r '.primary')"
else
  PRIMARY="$(echo "${STACK_JSON}" | grep -o '"primary"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"primary"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  BUILD_CMD="$(echo "${STACK_JSON}" | grep -o '"build_cmd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"build_cmd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  MARKER_LOOKUP="${PRIMARY}"
fi

# ---------------------------------------------------------------------------
# Check build command
# ---------------------------------------------------------------------------

if [[ -z "${BUILD_CMD}" ]]; then
  log "No build command detected for stack '${PRIMARY}'. Skipping build."
  exit 0
fi

# ---------------------------------------------------------------------------
# Verify marker file exists before running build
# ---------------------------------------------------------------------------

MARKER_FOUND=false

case "${PRIMARY}" in
  dotnet)
    if find "${WORKSPACE_ROOT}" \
        -not -path "*/node_modules/*" -not -path "*/.git/*" \
        \( -name "*.csproj" -o -name "*.sln" \) \
        -maxdepth 5 -print -quit 2>/dev/null | grep -q .; then
      MARKER_FOUND=true
    fi
    ;;
  java-maven)
    [[ -f "${WORKSPACE_ROOT}/pom.xml" ]] && MARKER_FOUND=true
    ;;
  java-gradle)
    { [[ -f "${WORKSPACE_ROOT}/build.gradle" ]] || [[ -f "${WORKSPACE_ROOT}/build.gradle.kts" ]]; } && MARKER_FOUND=true
    ;;
  node)
    [[ -f "${WORKSPACE_ROOT}/package.json" ]] && MARKER_FOUND=true
    ;;
  python)
    { [[ -f "${WORKSPACE_ROOT}/requirements.txt" ]] || [[ -f "${WORKSPACE_ROOT}/pyproject.toml" ]] || [[ -f "${WORKSPACE_ROOT}/setup.py" ]]; } && MARKER_FOUND=true
    ;;
  *)
    # generic or sql — no specific marker required
    MARKER_FOUND=true
    ;;
esac

if [[ "${MARKER_FOUND}" == false ]]; then
  log "WARNING: Expected marker file for stack '${PRIMARY}' not found in workspace."
  log "Skipping build to avoid running an incorrect command."
  exit 0
fi

# ---------------------------------------------------------------------------
# Run build
# ---------------------------------------------------------------------------

log "Stack    : ${PRIMARY}"
log "Command  : ${BUILD_CMD}"
log "Log file : ${BUILD_LOG}"
log ""

set +e
# shellcheck disable=SC2086
bash -c "${BUILD_CMD}" 2>&1 | tee "${BUILD_LOG}"
BUILD_EXIT=${PIPESTATUS[0]}
set -e

echo ""
if [[ ${BUILD_EXIT} -eq 0 ]]; then
  log "Build PASSED"
else
  log "Build FAILED (exit code ${BUILD_EXIT})"
fi

log "Log saved to: ${BUILD_LOG}"
exit ${BUILD_EXIT}
