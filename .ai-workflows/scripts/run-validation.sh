#!/usr/bin/env bash
# Run: chmod +x .ai-workflows/scripts/*.sh first
# run-validation.sh — Full validation pipeline: build, tests, lint, typecheck.
# Generates .ai-workflows/logs/validation-summary.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
LOG_DIR="${WORKSPACE_ROOT}/.ai-workflows/logs"
SUMMARY_FILE="${LOG_DIR}/validation-summary.md"

mkdir -p "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { echo "[run-validation] $*"; }
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Status values: PASS | FAIL | SKIPPED
BUILD_STATUS="SKIPPED"
TEST_STATUS="SKIPPED"
LINT_STATUS="SKIPPED"
TYPECHECK_STATUS="SKIPPED"

# ---------------------------------------------------------------------------
# Step 1: Stack detection
# ---------------------------------------------------------------------------

DETECT_SCRIPT="${SCRIPT_DIR}/detect-stack.sh"

if [[ ! -f "${DETECT_SCRIPT}" ]]; then
  log "ERROR: detect-stack.sh not found at ${DETECT_SCRIPT}" >&2
  exit 1
fi

log "Step 1/4 — Stack detection"
STACK_JSON="$("${DETECT_SCRIPT}")"

if command -v jq &>/dev/null; then
  PRIMARY="$(echo "${STACK_JSON}" | jq -r '.primary')"
  BUILD_CMD="$(echo "${STACK_JSON}" | jq -r '.build_cmd')"
  TEST_CMD="$(echo "${STACK_JSON}" | jq -r '.test_cmd')"
  LINT_CMD="$(echo "${STACK_JSON}" | jq -r '.lint_cmd')"
  TYPECHECK_CMD="$(echo "${STACK_JSON}" | jq -r '.typecheck_cmd')"
else
  PRIMARY="$(echo "${STACK_JSON}"     | grep -o '"primary"[[:space:]]*:[[:space:]]*"[^"]*"'     | sed 's/.*"\([^"]*\)".*/\1/')"
  BUILD_CMD="$(echo "${STACK_JSON}"   | grep -o '"build_cmd"[[:space:]]*:[[:space:]]*"[^"]*"'   | sed 's/.*"build_cmd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  TEST_CMD="$(echo "${STACK_JSON}"    | grep -o '"test_cmd"[[:space:]]*:[[:space:]]*"[^"]*"'    | sed 's/.*"test_cmd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  LINT_CMD="$(echo "${STACK_JSON}"    | grep -o '"lint_cmd"[[:space:]]*:[[:space:]]*"[^"]*"'    | sed 's/.*"lint_cmd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  TYPECHECK_CMD="$(echo "${STACK_JSON}" | grep -o '"typecheck_cmd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"typecheck_cmd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
fi

log "  Primary stack : ${PRIMARY}"
log "  Build         : ${BUILD_CMD:-<none>}"
log "  Test          : ${TEST_CMD:-<none>}"
log "  Lint          : ${LINT_CMD:-<none>}"
log "  Typecheck     : ${TYPECHECK_CMD:-<none>}"
log ""

# ---------------------------------------------------------------------------
# Step 2: Build
# ---------------------------------------------------------------------------

log "Step 2/4 — Build"
BUILD_SCRIPT="${SCRIPT_DIR}/run-build.sh"

if [[ ! -f "${BUILD_SCRIPT}" ]]; then
  log "  WARN: run-build.sh not found. Skipping build."
else
  set +e
  WORKSPACE_ROOT="${WORKSPACE_ROOT}" "${BUILD_SCRIPT}"
  BUILD_EXIT=$?
  set -e

  if [[ ${BUILD_EXIT} -eq 0 ]]; then
    BUILD_STATUS="PASS"
    log "  Build: PASS"
  else
    BUILD_STATUS="FAIL"
    log "  Build: FAIL (exit code ${BUILD_EXIT})"
  fi
fi
log ""

# ---------------------------------------------------------------------------
# Step 3: Tests
# ---------------------------------------------------------------------------

log "Step 3/4 — Tests"
TESTS_SCRIPT="${SCRIPT_DIR}/run-tests.sh"

if [[ ! -f "${TESTS_SCRIPT}" ]]; then
  log "  WARN: run-tests.sh not found. Skipping tests."
else
  set +e
  WORKSPACE_ROOT="${WORKSPACE_ROOT}" "${TESTS_SCRIPT}"
  TEST_EXIT=$?
  set -e

  if [[ ${TEST_EXIT} -eq 0 ]]; then
    TEST_STATUS="PASS"
    log "  Tests: PASS"
  else
    TEST_STATUS="FAIL"
    log "  Tests: FAIL (exit code ${TEST_EXIT})"
  fi
fi
log ""

# ---------------------------------------------------------------------------
# Step 4a: Lint
# ---------------------------------------------------------------------------

log "Step 4/4 — Lint & Typecheck"

if [[ -z "${LINT_CMD}" ]]; then
  log "  No lint command detected. Skipping lint."
else
  LINT_LOG="${LOG_DIR}/lint.log"
  log "  Running lint: ${LINT_CMD}"
  set +e
  # shellcheck disable=SC2086
  bash -c "${LINT_CMD}" 2>&1 | tee "${LINT_LOG}"
  LINT_EXIT=${PIPESTATUS[0]}
  set -e

  if [[ ${LINT_EXIT} -eq 0 ]]; then
    LINT_STATUS="PASS"
    log "  Lint: PASS"
  else
    LINT_STATUS="FAIL"
    log "  Lint: FAIL (exit code ${LINT_EXIT})"
  fi
fi

# ---------------------------------------------------------------------------
# Step 4b: Typecheck
# ---------------------------------------------------------------------------

if [[ -z "${TYPECHECK_CMD}" ]]; then
  log "  No typecheck command detected. Skipping typecheck."
else
  TYPECHECK_LOG="${LOG_DIR}/typecheck.log"
  log "  Running typecheck: ${TYPECHECK_CMD}"
  set +e
  # shellcheck disable=SC2086
  bash -c "${TYPECHECK_CMD}" 2>&1 | tee "${TYPECHECK_LOG}"
  TYPECHECK_EXIT=${PIPESTATUS[0]}
  set -e

  if [[ ${TYPECHECK_EXIT} -eq 0 ]]; then
    TYPECHECK_STATUS="PASS"
    log "  Typecheck: PASS"
  else
    TYPECHECK_STATUS="FAIL"
    log "  Typecheck: FAIL (exit code ${TYPECHECK_EXIT})"
  fi
fi

log ""

# ---------------------------------------------------------------------------
# Overall result — only FAIL statuses count against the result
# ---------------------------------------------------------------------------

OVERALL="PASS"
for STATUS in "${BUILD_STATUS}" "${TEST_STATUS}" "${LINT_STATUS}" "${TYPECHECK_STATUS}"; do
  if [[ "${STATUS}" == "FAIL" ]]; then
    OVERALL="FAIL"
    break
  fi
done

# ---------------------------------------------------------------------------
# Generate validation-summary.md
# ---------------------------------------------------------------------------

# Map status to icon
icon() {
  case "$1" in
    PASS)    echo "PASS" ;;
    FAIL)    echo "FAIL" ;;
    SKIPPED) echo "SKIPPED" ;;
    *)       echo "$1" ;;
  esac
}

cat > "${SUMMARY_FILE}" <<MARKDOWN
# Validation Summary

**Date:** ${TIMESTAMP}
**Stack:** ${PRIMARY}

| Check | Status | Log |
|-------|--------|-----|
| Build | $(icon "${BUILD_STATUS}") | .ai-workflows/logs/build.log |
| Tests | $(icon "${TEST_STATUS}") | .ai-workflows/logs/tests.log |
| Lint | $(icon "${LINT_STATUS}") | .ai-workflows/logs/lint.log |
| Typecheck | $(icon "${TYPECHECK_STATUS}") | .ai-workflows/logs/typecheck.log |

**Overall: ${OVERALL}**
MARKDOWN

# ---------------------------------------------------------------------------
# Print summary to stdout
# ---------------------------------------------------------------------------

echo ""
echo "========================================"
echo " Validation Summary"
echo "========================================"
echo " Date      : ${TIMESTAMP}"
echo " Stack     : ${PRIMARY}"
echo " Build     : ${BUILD_STATUS}"
echo " Tests     : ${TEST_STATUS}"
echo " Lint      : ${LINT_STATUS}"
echo " Typecheck : ${TYPECHECK_STATUS}"
echo "----------------------------------------"
echo " Overall   : ${OVERALL}"
echo "========================================"
echo ""
echo "Full summary written to: ${SUMMARY_FILE}"
echo ""

# ---------------------------------------------------------------------------
# Exit code
# ---------------------------------------------------------------------------

if [[ "${OVERALL}" == "PASS" ]]; then
  exit 0
else
  exit 1
fi
