#!/usr/bin/env bash
# Run: chmod +x .ai-workflows/scripts/*.sh first
# detect-stack.sh — Detects the project stack from marker files.
# Outputs clean JSON to stdout; human-readable summary to stderr.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
LOG_DIR="${WORKSPACE_ROOT}/.ai-workflows/logs"
LOG_FILE="${LOG_DIR}/stack-detection.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_info()  { echo "[detect-stack] $*" >&2; }
log_warn()  { echo "[detect-stack] WARN: $*" >&2; }

mkdir -p "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

STACKS=()

# dotnet — *.csproj or *.sln (anywhere under workspace, depth-limited)
if find "${WORKSPACE_ROOT}" \
    -not -path "${WORKSPACE_ROOT}/.ai-workflows/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    \( -name "*.csproj" -o -name "*.sln" \) \
    -maxdepth 5 -print -quit 2>/dev/null | grep -q .; then
  STACKS+=("dotnet")
  log_info "Detected: dotnet (.csproj / .sln)"
fi

# java-maven — pom.xml
if find "${WORKSPACE_ROOT}" \
    -not -path "${WORKSPACE_ROOT}/.ai-workflows/*" \
    -not -path "*/.git/*" \
    -name "pom.xml" \
    -maxdepth 5 -print -quit 2>/dev/null | grep -q .; then
  STACKS+=("java-maven")
  log_info "Detected: java-maven (pom.xml)"
fi

# java-gradle — build.gradle or build.gradle.kts
if find "${WORKSPACE_ROOT}" \
    -not -path "${WORKSPACE_ROOT}/.ai-workflows/*" \
    -not -path "*/.git/*" \
    \( -name "build.gradle" -o -name "build.gradle.kts" \) \
    -maxdepth 5 -print -quit 2>/dev/null | grep -q .; then
  STACKS+=("java-gradle")
  log_info "Detected: java-gradle (build.gradle)"
fi

# node — package.json but NOT inside node_modules or .ai-workflows
# We specifically exclude .ai-workflows/package.json (this tool's own node project)
if find "${WORKSPACE_ROOT}" \
    -not -path "${WORKSPACE_ROOT}/.ai-workflows/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -name "package.json" \
    -maxdepth 5 -print -quit 2>/dev/null | grep -q .; then
  STACKS+=("node")
  log_info "Detected: node (package.json)"
fi

# python — requirements.txt, pyproject.toml, or setup.py
if find "${WORKSPACE_ROOT}" \
    -not -path "${WORKSPACE_ROOT}/.ai-workflows/*" \
    -not -path "*/.git/*" \
    \( -name "requirements.txt" -o -name "pyproject.toml" -o -name "setup.py" \) \
    -maxdepth 5 -print -quit 2>/dev/null | grep -q .; then
  STACKS+=("python")
  log_info "Detected: python (requirements.txt / pyproject.toml / setup.py)"
fi

# sql — *.sql files (exclude .ai-workflows/)
if find "${WORKSPACE_ROOT}" \
    -not -path "${WORKSPACE_ROOT}/.ai-workflows/*" \
    -not -path "*/.git/*" \
    -name "*.sql" \
    -maxdepth 5 -print -quit 2>/dev/null | grep -q .; then
  STACKS+=("sql")
  log_info "Detected: sql (*.sql files)"
fi

# generic fallback
if [[ ${#STACKS[@]} -eq 0 ]]; then
  STACKS+=("generic")
  log_info "No specific stack detected — falling back to: generic"
fi

# ---------------------------------------------------------------------------
# Primary stack selection (first non-generic wins; prefer code stacks)
# ---------------------------------------------------------------------------

PRIMARY=""
for s in dotnet java-maven java-gradle node python sql generic; do
  for detected in "${STACKS[@]}"; do
    if [[ "${detected}" == "${s}" ]]; then
      PRIMARY="${s}"
      break 2
    fi
  done
done

# ---------------------------------------------------------------------------
# Commands per stack
# ---------------------------------------------------------------------------

BUILD_CMD=""
TEST_CMD=""
LINT_CMD=""
TYPECHECK_CMD=""

case "${PRIMARY}" in
  dotnet)
    BUILD_CMD="dotnet build"
    TEST_CMD="dotnet test"
    LINT_CMD=""
    TYPECHECK_CMD=""
    ;;
  java-maven)
    BUILD_CMD="mvn compile"
    TEST_CMD="mvn test"
    LINT_CMD="mvn checkstyle:check"
    TYPECHECK_CMD=""
    ;;
  java-gradle)
    BUILD_CMD="./gradlew build"
    TEST_CMD="./gradlew test"
    LINT_CMD="./gradlew checkstyleMain"
    TYPECHECK_CMD=""
    ;;
  node)
    # Detect package manager: pnpm > yarn > npm
    if [[ -f "${WORKSPACE_ROOT}/pnpm-lock.yaml" ]]; then
      PM="pnpm"
    elif [[ -f "${WORKSPACE_ROOT}/yarn.lock" ]]; then
      PM="yarn"
    else
      PM="npm"
    fi

    # Read scripts from package.json if jq is available
    PKG_JSON="${WORKSPACE_ROOT}/package.json"
    if command -v jq &>/dev/null && [[ -f "${PKG_JSON}" ]]; then
      HAS_BUILD=$(jq -r '.scripts.build // empty' "${PKG_JSON}")
      HAS_TEST=$(jq -r '.scripts.test // empty' "${PKG_JSON}")
      HAS_LINT=$(jq -r '.scripts.lint // empty' "${PKG_JSON}")
      HAS_TYPECHECK=$(jq -r '.scripts.typecheck // empty' "${PKG_JSON}")
      [[ -n "${HAS_BUILD:-}" ]]      && BUILD_CMD="${PM} run build"
      [[ -n "${HAS_TEST:-}" ]]       && TEST_CMD="${PM} test"
      [[ -n "${HAS_LINT:-}" ]]       && LINT_CMD="${PM} run lint"
      [[ -n "${HAS_TYPECHECK:-}" ]]  && TYPECHECK_CMD="${PM} run typecheck"
    else
      BUILD_CMD="${PM} run build"
      TEST_CMD="${PM} test"
      LINT_CMD="${PM} run lint"
      TYPECHECK_CMD="npx tsc --noEmit"
    fi
    ;;
  python)
    BUILD_CMD=""
    TEST_CMD="python -m pytest"
    LINT_CMD="python -m flake8"
    TYPECHECK_CMD="python -m mypy ."
    ;;
  sql)
    BUILD_CMD=""
    TEST_CMD=""
    LINT_CMD=""
    TYPECHECK_CMD=""
    ;;
  generic)
    BUILD_CMD=""
    TEST_CMD=""
    LINT_CMD=""
    TYPECHECK_CMD=""
    ;;
esac

# ---------------------------------------------------------------------------
# Build JSON
# ---------------------------------------------------------------------------

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Build stacks array as JSON
STACKS_JSON="["
for i in "${!STACKS[@]}"; do
  [[ ${i} -gt 0 ]] && STACKS_JSON+=","
  STACKS_JSON+="\"${STACKS[$i]}\""
done
STACKS_JSON+="]"

JSON_OUTPUT=$(cat <<EOF
{
  "stacks": ${STACKS_JSON},
  "primary": "${PRIMARY}",
  "build_cmd": "${BUILD_CMD}",
  "test_cmd": "${TEST_CMD}",
  "lint_cmd": "${LINT_CMD}",
  "typecheck_cmd": "${TYPECHECK_CMD}",
  "detected_at": "${TIMESTAMP}"
}
EOF
)

# Save to log file
echo "${JSON_OUTPUT}" > "${LOG_FILE}"
log_info "Stack detection saved to ${LOG_FILE}"

# Human-readable summary
log_info "-------------------------------------------"
log_info "  Primary stack : ${PRIMARY}"
log_info "  All stacks    : ${STACKS[*]}"
log_info "  Build         : ${BUILD_CMD:-<none>}"
log_info "  Test          : ${TEST_CMD:-<none>}"
log_info "  Lint          : ${LINT_CMD:-<none>}"
log_info "  Typecheck     : ${TYPECHECK_CMD:-<none>}"
log_info "-------------------------------------------"

# Clean JSON to stdout
echo "${JSON_OUTPUT}"
