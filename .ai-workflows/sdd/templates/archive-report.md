# Archive Report: <change-name>

**Archived At:** <!-- ISO 8601 datetime, e.g. 2024-01-15T16:00:00Z -->
**Agent:** Archiver
**Model:** north-mini-code-1.0
**Final Verdict:** <!-- PASS | PASS_WITH_WARNINGS — Archive is only written after a non-FAIL verdict -->

---

> **Instructions for the Archiver agent:**
> Read 07-verify-report.md and the full git diff for this change before writing.
> This document is the permanent record. It will be read by future engineers and agents
> who need to understand what changed and why. Write the PR description as if you are
> handing it to a code reviewer who has zero context — it must stand alone.
> Be precise about known limitations — do not minimize or omit them.

---

## Final Summary

<!-- 3-5 sentences suitable for a CHANGELOG entry or PR description.
     Must answer: (1) what changed, (2) why it changed, (3) what it enables.
     Write for an engineer who did not follow the entire SDD process. -->

---

## Files Changed (Final)

<!-- Authoritative list of all files modified or added by this change.
     Source: git diff against the base branch.
     Change Type: add | modify | delete | rename -->

| File | Change Type | Summary |
|------|-------------|---------|
| <!-- path/to/file --> | <!-- add/modify/delete/rename --> | <!-- what changed in this file --> |

---

## Final Validation Results

<!-- These must match the last PASS run in 07-verify-report.md. -->

- **Build:** <!-- PASS | FAIL -->
- **Tests:** <!-- PASS | FAIL | NO_TESTS (documented) -->
- **Lint:** <!-- PASS | SKIPPED (no linter configured) | N/A -->
- **Typecheck:** <!-- PASS | FAIL | SKIPPED (not applicable) -->
- **Security Review:** <!-- PASS | PASS_WITH_WARNINGS (warnings listed below) -->
- **Verify Loop Iterations:** <!-- number — how many Verify/Fix cycles before PASS -->

---

## Known Limitations

<!-- Explicit, honest list of gaps, limitations, or intentional shortcuts.
     This is NOT a failure — it is professional documentation.
     Include anything from verify-report.md WARNING issues that were accepted.
     If none: write "None identified." — do not leave blank. -->

- <!-- e.g. "Token revocation is not implemented — tokens expire naturally. Acceptable for v1." -->
- <!-- e.g. "No integration tests for the concurrent refresh scenario (WARN-01 from verify report). Unit test covers the mutex logic." -->

---

## Decisions Made

<!-- Final record of all significant decisions from design.md and apply-progress.md.
     Include any decisions where the implementation deviated from the original design. -->

| Decision | Rationale | Alternative Rejected | Trade-off |
|----------|-----------|---------------------|-----------|
| <!-- e.g. "DB advisory lock for concurrent refresh" --> | <!-- stateless service, multiple replicas --> | <!-- In-memory mutex --> | <!-- Slightly higher latency on refresh; eliminates race condition across replicas --> |

---

## Follow-up Tasks

<!-- Deferred work identified during this change.
     Each item should reference why it was deferred (out of scope, time, dependencies).
     Format: - [ ] [task description] — reason deferred — suggested change name -->

- [ ] <!-- e.g. Token revocation list — deferred: out of scope per spec — suggested: token-revocation-v1 -->

---

## Lessons Learned

<!-- Honest retrospective. This section makes the next change better.
     Cover: what went well, what was harder than expected, what was discovered
     mid-implementation that was not in the explore report, and any process improvements. -->

**What went well:**
- <!-- ... -->

**What was harder than expected:**
- <!-- ... -->

**Discoveries mid-implementation:**
- <!-- ... -->

**Process improvements for next time:**
- <!-- ... -->

---

## PR Description (Ready to Copy)

<!-- Pre-formatted PR description. Copy-paste into GitHub/GitLab/Bitbucket.
     Follows conventional commit style. Reviewers should be able to understand
     the change from this description alone. -->

---

### <!-- feat/fix/refactor/chore: short title (max 72 chars) -->

#### What

<!-- 2-3 bullet points describing what was built or changed. -->

- <!-- ... -->

#### Why

<!-- 1-2 sentences on the motivation. What problem does this solve? -->

#### How

<!-- 2-4 bullet points on the implementation approach. Reference key files. -->

- <!-- ... -->

#### Testing

<!-- How was this tested? List test files, coverage, and any manual verification steps. -->

- <!-- ... -->

#### Known Limitations

<!-- Copy from Known Limitations section above. -->

- <!-- ... -->

#### Checklist

- [ ] Build passes
- [ ] Tests pass
- [ ] Types check
- [ ] Lint clean
- [ ] Security review complete
- [ ] No secrets or PII in code or logs
- [ ] Spec compliance verified (see 07-verify-report.md)

---
