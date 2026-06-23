# Apply Progress: <change-name>

**Started:** <!-- ISO 8601 datetime, e.g. 2024-01-15T10:00:00Z -->
**Last Updated:** <!-- ISO 8601 datetime — update this on every write -->
**Agent:** Implementer / Tester
**Review Loop Iteration:** <!-- 1, 2, 3... — increment each time Verify sends back a FAIL -->

---

> **Instructions for the Implementer agent:**
> Update this file continuously as you work — not just at the end.
> Log every command you run with its exit code. If you encounter an open question
> from design.md, document your decision in the "Decisions Made" section.
> Never skip a Validation Command from tasks.md — run it and record the result.
> If a task is blocked, surface it in the "Blockers" section immediately.

---

## Tasks Status

<!-- Update status as you work. Do not wait until the end.
     Status values: pending | in-progress | complete | blocked | skipped -->

| Task ID | Title | Status | Completed At |
|---------|-------|--------|-------------|
| TASK-01 | <!-- title --> | <!-- pending/in-progress/complete/blocked/skipped --> | <!-- ISO datetime or "-" --> |

---

## Files Changed

<!-- Running log of all files touched during this apply phase.
     Change Type: add | modify | delete | rename
     Update this as each task completes — don't reconstruct it at the end. -->

| File | Change Type | Task ID | Summary of Change |
|------|-------------|---------|-------------------|
| <!-- path/to/file --> | <!-- add/modify/delete/rename --> | <!-- TASK-xx --> | <!-- one-line description --> |

---

## Commands Run

<!-- Ordered log of every command executed during Apply.
     This log is used by Verify to reproduce the build and test state.
     Format: | timestamp | command | exit_code | notes -->

| # | Timestamp | Command | Exit Code | Notes |
|---|-----------|---------|-----------|-------|
| 1 | <!-- 2024-01-15T10:05:00Z --> | <!-- pnpm install --> | <!-- 0 --> | <!-- installed deps --> |

---

## Build / Test Results

### Latest Build

- **Command:** <!-- e.g. pnpm build -->
- **Exit Code:** <!-- 0 = pass, non-0 = fail -->
- **Log:** <!-- .ai-workflows/logs/build-<timestamp>.log -->
- **Status:** <!-- PASS | FAIL -->
- **Summary:** <!-- key output lines, or error message if FAIL -->

### Latest Test Run

- **Command:** <!-- e.g. pnpm test -->
- **Exit Code:** <!-- 0 = pass, non-0 = fail -->
- **Log:** <!-- .ai-workflows/logs/tests-<timestamp>.log -->
- **Status:** <!-- PASS | FAIL | NO_TESTS -->
- **Summary:** <!-- e.g. "47 passed, 0 failed, 3 skipped" or failing test names if FAIL -->

### Latest Lint / Typecheck

- **Command:** <!-- e.g. pnpm typecheck -->
- **Exit Code:** <!-- ... -->
- **Status:** <!-- PASS | FAIL | SKIPPED -->
- **Summary:** <!-- ... -->

---

## Errors Found

<!-- Log every build, test, or lint error encountered.
     Status: open | fixed | deferred (deferred requires Blockers entry) -->

| # | Error | Source | Task ID | Status |
|---|-------|--------|---------|--------|
| 1 | <!-- error description or first line of error --> | <!-- build/test/lint/typecheck --> | <!-- TASK-xx --> | <!-- open/fixed/deferred --> |

---

## Fixes Applied

<!-- For each error fixed: what was wrong, what was changed, and did the fix work.
     This becomes evidence for the Verifier. -->

| Error # | Fix Applied | Files Changed | Result |
|---------|-------------|--------------|--------|
| 1 | <!-- description of fix --> | <!-- path/to/file --> | <!-- PASS / still failing / introduced new error --> |

---

## Decisions Made

<!-- Document every decision made during implementation, especially:
     - Resolutions to open questions from design.md
     - Deviations from the design (must state why)
     - Choices between implementation alternatives not specified in tasks.md -->

| Decision | Context | Options Considered | Chosen Option | Rationale |
|----------|---------|-------------------|---------------|-----------|
| <!-- e.g. "Mutex implementation for concurrent refresh" --> | <!-- Open question from design.md --> | <!-- (a) in-memory mutex (b) DB advisory lock --> | <!-- (b) DB advisory lock --> | <!-- stateless service, multiple replicas possible --> |

---

## Remaining Tasks

<!-- Checklist of tasks not yet complete. Remove items as they are done.
     This is the Implementer's working queue — keep it current. -->

- [ ] <!-- TASK-xx: title -->

---

## Blockers

<!-- Anything stopping progress that requires an orchestrator or human decision.
     A blocker must be surfaced here before the task is marked "blocked".
     Format: what is blocked, why it's blocked, what decision is needed. -->

- <!-- e.g. "TASK-04 blocked: migration file conflicts with migration created in parallel branch.
             Needs human to decide: rebase this branch or create a new sequential migration." -->
