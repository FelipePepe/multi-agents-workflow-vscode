# Verify Current Change

**Purpose**: Runs the verification agent to produce a structured review report. Validates spec compliance, security posture, code quality, and test coverage. Issues a final PASS / PASS_WITH_WARNINGS / FAIL verdict.

**Model / Agent role**: `deepseek-r1:70b` — Verifier

**Use in**: Claude Code, Cline, Continue, OpenCode, Codex

---

## Step 1 — Identify the change

Ask for the change name if not provided.

---

## Step 2 — Read all required files

Read ALL of the following files. Do NOT skip any that exist.

**Planning artifacts** (always required — stop if missing):
- `.ai-workflows/sdd/changes/<name>/03-spec.md`
- `.ai-workflows/sdd/changes/<name>/05-tasks.md`
- `.ai-workflows/sdd/changes/<name>/06-apply-progress.md`

**Build and test logs** (read if they exist, note if absent):
- `.ai-workflows/logs/build.log`
- `.ai-workflows/logs/tests.log`
- `.ai-workflows/logs/validation-summary.md`

**Implementation files** (always required):
- Read every file listed under "Files Modified" in `06-apply-progress.md`.
- If a listed file does not exist on disk, that is a CRITICAL finding.

If `03-spec.md`, `05-tasks.md`, or `06-apply-progress.md` are missing, stop:

> "Cannot verify: `<missing-file>` not found. The change may not be in the apply phase yet."

---

## Step 3 — Verify spec compliance

For each acceptance criterion in `03-spec.md`:

1. State the criterion exactly as written.
2. Search the implementation files for evidence of it being satisfied.
3. Classify the result:
   - **COVERED**: criterion is clearly implemented and testable.
   - **PARTIALLY COVERED**: implementation exists but incomplete (e.g., missing edge case handling).
   - **NOT COVERED**: no implementation found — this is a CRITICAL finding.

List every criterion, even if covered.

---

## Step 4 — Review security

Scan all modified files for the following vulnerability classes. For each finding, cite the file and (if determinable) the relevant code area.

| Category | What to look for |
|----------|-----------------|
| **SQL Injection** | String-concatenated queries, unparameterized inputs, ORM raw query calls with user data |
| **Command Injection** | `exec`, `spawn`, `subprocess`, `Process.Start` with user-controlled arguments |
| **LDAP Injection** | User input in LDAP filter strings without escaping |
| **XML / XXE** | XML parsers with external entity processing enabled, untrusted XML input |
| **Broken Authentication** | Hardcoded credentials, weak session tokens, missing auth middleware, insecure token storage |
| **Sensitive Data Exposure** | API keys, passwords, tokens, or PII in source code, config files, or log statements |
| **Broken Access Control** | Missing authorization checks on endpoints, insecure direct object references |
| **Security Misconfiguration** | Debug mode in production code, default credentials, verbose error messages with stack traces |
| **XSS** | Unescaped user input rendered as HTML; `innerHTML`, `dangerouslySetInnerHTML`, Razor `@Html.Raw` with user data |
| **SSRF** | User-controlled URLs passed to HTTP client calls without allowlist validation |
| **Path Traversal** | User-controlled file paths without normalization and boundary validation |
| **Unsafe Deserialization** | `pickle.loads`, `eval`, `JSON.parse` on user input without schema validation, `BinaryFormatter` |
| **Sensitive Data in Logs** | Passwords, tokens, PII, session IDs passed to logging calls |
| **Supply Chain** | New dependencies added — flag them for `npm audit` / `pip-audit` / `OWASP Dependency Check` |

Severity classification:

- **CRITICAL**: exploitable with direct impact (data breach, RCE, auth bypass, privilege escalation).
- **WARNING**: security gap that requires effort to exploit or has limited impact.
- **SUGGESTION**: best-practice improvement with no direct exploitability.

---

## Step 5 — Review code quality

For each modified file, check:

1. **Null / undefined handling**: are all nullable references checked before use?
2. **Error propagation**: are errors caught and handled, or swallowed silently? Are error types appropriate?
3. **Resource cleanup**: are file handles, DB connections, HTTP clients, and streams properly closed (using `finally`, `using`, `with`, `defer`, etc.)?
4. **Concurrency**: are shared mutable state and race conditions addressed?
5. **Hallucinated APIs**: do all method calls, module imports, and library APIs actually exist in the codebase or installed dependencies?
6. **Dead code**: are there unused variables, imports, or unreachable branches?
7. **Magic values**: are unexplained numeric/string literals that should be named constants?

Classify each finding as CRITICAL, WARNING, or SUGGESTION.

---

## Step 6 — Check test task completion

Read `05-tasks.md`. For every task tagged as a test task (e.g., "Write unit tests for...", "Add integration test for..."):

- Check whether it is marked complete in `06-apply-progress.md`.
- If NOT complete: this is a WARNING (or CRITICAL if the spec requires tests for the acceptance criterion to be verified).

---

## Step 7 — Write the verification report

Write: `.ai-workflows/sdd/changes/<name>/07-verify-report.md`

Use this structure:

```markdown
# Verification Report: <change-name>

**Date**: <ISO timestamp>
**Model**: deepseek-r1:70b
**Verdict**: PASS | PASS_WITH_WARNINGS | FAIL

---

## Spec Compliance

| Criterion | Status | Evidence |
|-----------|--------|----------|
| <criterion text> | COVERED / PARTIALLY COVERED / NOT COVERED | <file or note> |

---

## Security Findings

### CRITICAL
(list findings or "None")

### WARNING
(list findings or "None")

### SUGGESTION
(list findings or "None")

---

## Code Quality Findings

### CRITICAL
(list findings or "None")

### WARNING
(list findings or "None")

### SUGGESTION
(list findings or "None")

---

## Test Coverage

| Test Task | Status |
|-----------|--------|
| <task description> | Complete / Incomplete |

---

## Build and Test Logs

- Build log: <PASS / FAIL / NOT FOUND>
- Tests log: <PASS / FAIL / NOT FOUND>
- Validation summary: <PASS / FAIL / NOT FOUND>

---

## Verdict Rationale

<One paragraph explaining the verdict decision.>
```

---

## Step 8 — Update state.json

Update `.ai-workflows/sdd/changes/<name>/state.json`:

- Set `phases.sdd-verify.status` to `"complete"`
- Set `phases.sdd-verify.completedAt` to current ISO timestamp
- Set `verifyVerdict` to one of: `"PASS"`, `"PASS_WITH_WARNINGS"`, `"FAIL"`
- Set `artifacts.verify` to `"07-verify-report.md"`
- If verdict is PASS or PASS_WITH_WARNINGS: set `currentPhase` to `"sdd-archive"`
- If verdict is FAIL: set `currentPhase` to `"sdd-apply"` (requires fix iteration)
- Update `updatedAt`

---

## Step 9 — Print the final verdict

Print clearly:

```
VERDICT: PASS
(or PASS_WITH_WARNINGS / FAIL)

Summary:
  Spec criteria: X covered, Y not covered
  Security: Z critical, W warnings
  Code quality: A critical, B warnings
  Tests: C complete, D incomplete

Report written to: .ai-workflows/sdd/changes/<name>/07-verify-report.md
```

If FAIL or PASS_WITH_WARNINGS, list the highest-priority items to address first.

---

## Verdict Rules

| Verdict | Conditions |
|---------|-----------|
| **FAIL** | Any CRITICAL issue (security or code quality) OR any NOT COVERED acceptance criterion OR build log shows failure OR test log shows failure |
| **PASS_WITH_WARNINGS** | No CRITICAL issues, no NOT COVERED criteria, build and tests pass, but WARNING findings exist |
| **PASS** | No CRITICAL issues, no WARNING findings, all criteria COVERED, build passes, tests pass |

---

## Hard Constraints

- **NEVER modify production code** in this prompt — read-only analysis only.
- **NEVER skip reading the implementation files** listed in `06-apply-progress.md`.
- **NEVER issue PASS** if there are any CRITICAL findings or NOT COVERED acceptance criteria.
- **NEVER issue PASS** if the build log shows a failure.
- **NEVER omit security categories** from the review — check all 13 categories, even if only to report "None found."
- **NEVER write speculative findings** without citing specific code evidence.

---

## Expected Outputs

| File | When written |
|------|-------------|
| `.ai-workflows/sdd/changes/<name>/07-verify-report.md` | Step 7 |
| `.ai-workflows/sdd/changes/<name>/state.json` | Step 8 |
