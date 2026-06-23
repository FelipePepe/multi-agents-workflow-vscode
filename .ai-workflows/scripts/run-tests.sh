#!/usr/bin/env bash
# Run: chmod +x .ai-workflows/scripts/*.sh first
# run-tests.sh — Runs the test command detected for this project stack.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
LOG_DIR="${WORKSPACE_ROOT}/.ai-workflows/logs"
TESTS_LOG="${LOG_DIR}/tests.log"
DETECT_SCRIPT="${SCRIPT_DIR}/detect-stack.sh"

mkdir -p "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[run-tests] $*"; }

# ---------------------------------------------------------------------------
# Run stack detection
# ---------------------------------------------------------------------------

if [[ ! -f "${DETECT_SCRIPT}" ]]; then
  echo "[run-tests] ERROR: detect-stack.sh not found at ${DETECT_SCRIPT}" >&2
  exit 1
fi

log "Running stack detection..."
STACK_JSON="$("${DETECT_SCRIPT}")"

# ---------------------------------------------------------------------------
# Parse JSON — prefer jq, fall back to grep/sed
# ---------------------------------------------------------------------------

if command -v jq &>/dev/null; then
  PRIMARY="$(echo "${STACK_JSON}" | jq -r '.primary')"
  TEST_CMD="$(echo "${STACK_JSON}" | jq -r '.test_cmd')"
else
  PRIMARY="$(echo "${STACK_JSON}" | grep -o '"primary"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"primary"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  TEST_CMD="$(echo "${STACK_JSON}" | grep -o '"test_cmd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"test_cmd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
fi

# ---------------------------------------------------------------------------
# Check test command
# ---------------------------------------------------------------------------

if [[ -z "${TEST_CMD}" ]]; then
  log "No test command detected for stack '${PRIMARY}'. Skipping tests."
  exit 0
fi

# ---------------------------------------------------------------------------
# Verify marker file exists before running tests
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
    MARKER_FOUND=true
    ;;
esac

if [[ "${MARKER_FOUND}" == false ]]; then
  log "WARNING: Expected marker file for stack '${PRIMARY}' not found in workspace."
  log "Skipping tests to avoid running an incorrect command."
  exit 0
fi

# ---------------------------------------------------------------------------
# Run tests
# ---------------------------------------------------------------------------

log "Stack    : ${PRIMARY}"
log "Command  : ${TEST_CMD}"
log "Log file : ${TESTS_LOG}"
log ""

set +e
# shellcheck disable=SC2086
bash -c "${TEST_CMD}" 2>&1 | tee "${TESTS_LOG}"
TEST_EXIT=${PIPESTATUS[0]}
set -e

echo ""
if [[ ${TEST_EXIT} -eq 0 ]]; then
  log "Tests PASSED"
else
  log "Tests FAILED (exit code ${TEST_EXIT})"
fi

log "Log saved to: ${TESTS_LOG}"
exit ${TEST_EXIT}
