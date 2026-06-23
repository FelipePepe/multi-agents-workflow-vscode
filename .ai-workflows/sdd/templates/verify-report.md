# Verify Report: <change-name>

**Date:** <!-- ISO 8601 datetime, e.g. 2024-01-15T14:30:00Z -->
**Agent:** Verifier
**Model:** deepseek-r1:70b
**Review Loop Iteration:** <!-- number — matches the iteration in apply-progress.md -->

---

> **Instructions for the Verifier agent:**
> You are an independent reviewer. Read all prior artifacts (explore through apply-progress)
> AND the actual code diff before writing anything here. Your job is to find problems —
> not to praise the implementation. A PASS that misses a CRITICAL issue is a worse outcome
> than a false FAIL. Be specific: every finding must include file path and line number.
> You do NOT fix code. You emit findings. The Implementer fixes them.

---

## Spec Compliance

<!-- Check every acceptance criterion from 03-spec.md against the implementation.
     Status: PASS = implemented and verified | FAIL = not implemented or incorrect |
             PARTIAL = partially implemented | N/A = explicitly out of scope -->

| Requirement ID | Status | Evidence | Notes |
|---------------|--------|---------|-------|
| AC-FR-01 | <!-- PASS/FAIL/PARTIAL/N/A --> | <!-- file:line or test name --> | <!-- ... --> |
| AC-NFR-01 | <!-- PASS/FAIL/PARTIAL/N/A --> | <!-- file:line or test name --> | <!-- ... --> |

---

## Build Status

- **Status:** <!-- PASS | FAIL -->
- **Command:** <!-- exact command run to build -->
- **Log:** <!-- path to log file, e.g. .ai-workflows/logs/build-verify-<timestamp>.log -->
- **Key Output:** <!-- relevant lines from build output, especially errors if FAIL -->

---

## Test Status

- **Status:** <!-- PASS | FAIL | NO_TESTS -->
- **Command:** <!-- exact command run to execute tests -->
- **Tests:** <!-- e.g. "52 passed / 3 failed / 1 skipped" -->
- **Failures:** <!-- list each failing test name and the assertion that failed, or "none" -->
- **Coverage:** <!-- coverage % if available, or "not configured" -->

---

## Security Review

<!-- Check each item against the actual implementation.
     Status: PASS = correctly implemented | FAIL = vulnerability found | N/A = not applicable -->

| Check | Status | Notes |
|-------|--------|-------|
| Input Validation | <!-- PASS/FAIL/N/A --> | <!-- what was checked, what was found --> |
| Authentication / Authorization | <!-- PASS/FAIL/N/A --> | <!-- ... --> |
| Injection Prevention (SQL/NoSQL/Command) | <!-- PASS/FAIL/N/A --> | <!-- ... --> |
| Secrets Handling | <!-- PASS/FAIL/N/A --> | <!-- no plaintext secrets in code or logs --> |
| Path Traversal | <!-- PASS/FAIL/N/A --> | <!-- ... --> |
| SSRF | <!-- PASS/FAIL/N/A --> | <!-- ... --> |
| XSS | <!-- PASS/FAIL/N/A --> | <!-- ... --> |
| Sensitive Data in Logs | <!-- PASS/FAIL/N/A --> | <!-- PII, tokens, passwords not logged --> |
| Dependency Risks | <!-- PASS/FAIL/N/A --> | <!-- new deps audited? known CVEs? --> |
| Rate Limiting | <!-- PASS/FAIL/N/A --> | <!-- ... --> |

---

## Code Quality Review

<!-- Code quality findings. Use Severity to distinguish must-fix from nice-to-fix.
     Severity: CRITICAL = must fix before PASS | WARNING = should fix, must document if not |
               SUGGESTION = optional improvement -->

| Area | Status | Issue | Severity | File:Line |
|------|--------|-------|----------|-----------|
| Null / Undefined Handling | <!-- OK/ISSUE --> | <!-- ... --> | <!-- CRITICAL/WARNING/SUGGESTION --> | <!-- path:line --> |
| Error Propagation | <!-- OK/ISSUE --> | <!-- ... --> | | |
| Resource Cleanup | <!-- OK/ISSUE --> | <!-- ... --> | | |
| Concurrency / Race Conditions | <!-- OK/ISSUE --> | <!-- ... --> | | |
| API Contract Accuracy | <!-- OK/ISSUE --> | <!-- ... --> | | |
| Dead Code | <!-- OK/ISSUE --> | <!-- ... --> | | |
| Magic Numbers / Hardcoded Values | <!-- OK/ISSUE --> | <!-- ... --> | | |
| Test Quality | <!-- OK/ISSUE --> | <!-- ... --> | | |

---

## Issues Found

### CRITICAL Issues

<!-- Must be fixed before this report can emit PASS.
     Each CRITICAL issue blocks the PASS verdict.
     Format for each issue:
     **CRIT-01: <short title>**
     - File: path/to/file.ts:42
     - Problem: clear description of what is wrong
     - Why Critical: why this causes a production risk or spec violation
     - Suggested Fix: concrete guidance (not full code — guidance)
-->

<!-- If none: write "None." -->

### WARNING Issues

<!-- Should be fixed. If left unfixed, they must be documented in archive-report.md Known Limitations.
     **WARN-01: <short title>**
     - File: path/to/file.ts:88
     - Problem: description
     - Impact: what could go wrong
     - Suggested Fix: guidance
-->

<!-- If none: write "None." -->

### SUGGESTIONS

<!-- Optional improvements. Do not block the verdict.
     **SUGG-01: <short title>**
     - File: path/to/file.ts:15
     - Suggestion: description and rationale
-->

<!-- If none: write "None." -->

---

## Regression Risk

- **Level:** <!-- LOW | MEDIUM | HIGH -->
- **Reasoning:** <!-- Why this risk level. Reference specific files or patterns that could affect existing functionality. -->
- **Tests covering existing behavior:** <!-- list existing test files that protect against regression, or "none found" -->

---

## Final Verdict

<!-- PASS: All CRITICAL issues resolved. Build and tests pass. All MUST requirements met.
     PASS_WITH_WARNINGS: No CRITICALs, but WARNING issues exist. Documented and accepted.
     FAIL: One or more CRITICAL issues, or build/tests failing, or a MUST requirement unmet. -->

**Verdict: <!-- PASS | PASS_WITH_WARNINGS | FAIL -->**

**Rationale:** <!-- 2-4 sentences explaining the verdict. If FAIL: list the specific blockers.
                    If PASS_WITH_WARNINGS: list the warnings being accepted and why. -->

<!-- If FAIL — provide clear instructions for the Implementer: -->
**Next Steps for Implementer:**
<!-- - Fix CRIT-01: [specific action]
     - Fix CRIT-02: [specific action]
     - Re-run: [exact command] to verify fixes -->
