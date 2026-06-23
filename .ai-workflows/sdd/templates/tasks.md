# Tasks: <change-name>

**Date:** <!-- ISO 8601 date, e.g. 2024-01-15 -->
**Agent:** Tasks
**Model:** qwen3-coder-next
**Status:** <!-- draft | complete -->
**Based on:** 03-spec.md, 04-design.md

---

> **Instructions for the Tasks agent:**
> Read 03-spec.md and 04-design.md in full before writing any task. Every task
> must be independently completable and independently verifiable. The Validation
> Command must be a real, runnable command — not a description.
> Every acceptance criterion from 03-spec.md MUST be covered by at least one task.
> Verify this in the "Acceptance Criteria Coverage" section before marking Status: complete.

---

## Task List

<!-- Each task is a discrete unit of work. Rules:
     - One task = one concern. Split tasks that touch unrelated files.
     - Dependencies must be justified — avoid artificial sequencing.
     - Validation Command must be exact and runnable (copy-pasteable).
     - Done Criteria is observable: "test passes" or "command exits 0", not "it works". -->

### TASK-01: <!-- Short imperative title, e.g. "Add TokenRefreshService" -->

- **Description:** <!-- What to implement, with reference to design.md component/interface -->
- **Files to Modify:** <!-- comma-separated paths, or "none" -->
- **Files to Add:** <!-- comma-separated paths, or "none" -->
- **Dependencies:** <!-- TASK-xx, or "none" -->
- **Validation Command:** <!-- e.g. pnpm test src/auth/token-refresh.service.test.ts -->
- **Done Criteria:** <!-- e.g. "All 8 unit tests in token-refresh.service.test.ts pass" -->
- **Risk Level:** <!-- LOW | MEDIUM | HIGH -->
- **Parallelizable with:** <!-- TASK-xx list, or "none" -->

<!-- Copy this block for each additional task. Increment numbers: TASK-02, TASK-03, etc. -->

<!--
### TASK-02: <!-- title -->

- **Description:** <!-- ... -->
- **Files to Modify:** <!-- ... -->
- **Files to Add:** <!-- ... -->
- **Dependencies:** <!-- TASK-xx | none -->
- **Validation Command:** <!-- exact command -->
- **Done Criteria:** <!-- observable outcome -->
- **Risk Level:** <!-- LOW | MEDIUM | HIGH -->
- **Parallelizable with:** <!-- TASK-xx | none -->
-->

---

## Acceptance Criteria Coverage

<!-- Map every AC from 03-spec.md to the task(s) that implement it.
     Status column: covered | partial | uncovered
     An "uncovered" AC is a blocker — add a task before marking this file complete. -->

| Acceptance Criterion | Covered By Task(s) | Status |
|---------------------|-------------------|--------|
| AC-FR-01: <!-- criterion text --> | <!-- TASK-xx --> | <!-- covered/partial/uncovered --> |
| AC-NFR-01: <!-- criterion text --> | <!-- TASK-xx --> | <!-- covered/partial/uncovered --> |

---

## Execution Order

<!-- Ordered list accounting for dependencies and parallelism opportunities.
     Group tasks that CAN run in parallel on the same step.
     Format: Step N (parallel) — TASK-xx, TASK-yy -->

1. <!-- e.g. Step 1 (sequential) — TASK-01: must run first, creates the service -->
2. <!-- e.g. Step 2 (parallel)   — TASK-02, TASK-03: independent, can run simultaneously -->
3. <!-- e.g. Step 3 (sequential) — TASK-04: depends on TASK-02 and TASK-03 outputs -->

---

## Test Tasks

<!-- List tasks specifically dedicated to test coverage.
     Each test task should target a cluster of related FRs.
     These tasks run after the implementation tasks they cover. -->

| Test Task | Covers FRs | Test File(s) | Type |
|-----------|-----------|-------------|------|
| <!-- TASK-xx --> | <!-- FR-01, FR-02 --> | <!-- path/to/file.test.ts --> | <!-- unit/integration/e2e --> |

---

## Estimated Scope

<!-- Fill in after all tasks are defined. -->

- **Total tasks:** <!-- count -->
- **Implementation tasks:** <!-- count (non-test tasks) -->
- **Test tasks:** <!-- count -->
- **Files to modify:** <!-- count (unique files across all tasks) -->
- **Files to add:** <!-- count (unique new files across all tasks) -->
- **Risk summary:** <!-- e.g. "2 HIGH, 3 MEDIUM, 4 LOW" -->
- **Estimated parallelism:** <!-- e.g. "Steps 2 and 3 can run in parallel, saving ~40% wall-clock time" -->
