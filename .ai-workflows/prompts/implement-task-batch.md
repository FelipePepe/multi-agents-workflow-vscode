# Implement a Task Batch

**Purpose**: Implements a small, controlled batch of tasks from the task list. Applies exactly the changes described in the spec and design — no more, no less. Updates the progress log after each batch.

**Model / Agent role**: `qwen3-coder-next` — Implementer

**Use in**: Claude Code, Cline, Continue, OpenCode, Codex

---

## Step 1 — Identify the change

Ask for the change name if not provided.

Verify that all of the following files exist before proceeding:

- `.ai-workflows/sdd/changes/<name>/03-spec.md`
- `.ai-workflows/sdd/changes/<name>/04-design.md`
- `.ai-workflows/sdd/changes/<name>/05-tasks.md`

If any of these files are missing, stop immediately:

> "Cannot implement: `<missing-file>` does not exist. Complete the planning phases first using `start-sdd-change.md` or `continue-sdd-change.md`."

---

## Step 2 — Read all planning artifacts

Read in this order:

1. `.ai-workflows/sdd/changes/<name>/03-spec.md` — acceptance criteria, data contracts, edge cases.
2. `.ai-workflows/sdd/changes/<name>/04-design.md` — architecture decisions, file-level changes, interface definitions.
3. `.ai-workflows/sdd/changes/<name>/05-tasks.md` — full task checklist with IDs, dependencies, and file lists.
4. `.ai-workflows/sdd/changes/<name>/06-apply-progress.md` — if it exists, to see which tasks are already complete.

Build an internal view of the task graph: which tasks are `pending`, which are `complete`, and which have unsatisfied dependencies.

---

## Step 3 — Select the next batch

Apply ALL of these selection rules simultaneously:

1. Only include tasks with status `pending`.
2. Only include tasks whose dependencies are ALL `complete`.
3. The batch must touch a combined total of **4 files or fewer** across all selected tasks.
4. Prefer tasks that unblock the most downstream tasks.
5. Do NOT split a single task across batches.

After selection, print the proposed batch:

```
Proposed batch:
  TASK-003  Add UserRepository interface         → src/repositories/UserRepository.ts
  TASK-004  Implement InMemoryUserRepository     → src/repositories/InMemoryUserRepository.ts
  TASK-005  Wire repository into DI container    → src/di/container.ts

Files affected: 3
```

Ask the user:

> "Confirm this batch? (yes / no / adjust)"

Wait for confirmation. Do NOT implement before the user confirms.

---

## Step 4 — Implement each task

For each task in the confirmed batch, follow this exact sequence:

### 4a. Read before writing

Read every file you are about to modify. If the file does not exist yet, note that it will be created.

State clearly: "Reading `<file>` before modifying."

### 4b. Implement the change

Apply only the change described by this task, as specified in `04-design.md` and `03-spec.md`.

Follow all existing code conventions observed in the repository:
- Indentation style (tabs vs spaces, width)
- Import ordering and grouping
- Naming conventions (camelCase, PascalCase, snake_case, etc.)
- File structure and module layout
- Brace style for conditionals and loops

**Always use braces** for all conditionals and loops in C#, Java, JavaScript, and TypeScript — even for single-line bodies.

### 4c. Report what changed

After each task, state:

```
TASK-003 complete:
  Modified: src/repositories/UserRepository.ts
  Changes:  Added UserRepository interface with findById, findByEmail, save methods
  Why:      Required by design.md §3.2 — repository abstraction layer
  Validate: npx tsc --noEmit
```

---

## Step 5 — Post-batch summary

After all tasks in the batch are complete, print:

```
Batch complete.
Tasks implemented: TASK-003, TASK-004, TASK-005
Files modified:
  - src/repositories/UserRepository.ts
  - src/repositories/InMemoryUserRepository.ts
  - src/di/container.ts

Run validation:
  npx tsc --noEmit && npm test

Then run: verify-current-change.md
```

---

## Step 6 — Update the progress log

Write or update `.ai-workflows/sdd/changes/<name>/06-apply-progress.md`.

The file must contain:

```markdown
# Apply Progress: <change-name>

## Completed Tasks

| Task ID | Description | Files Modified | Completed At |
|---------|-------------|----------------|--------------|
| TASK-003 | Add UserRepository interface | src/repositories/UserRepository.ts | <ISO timestamp> |
| TASK-004 | Implement InMemoryUserRepository | src/repositories/InMemoryUserRepository.ts | <ISO timestamp> |

## Pending Tasks

(list remaining pending tasks from 05-tasks.md)

## Files Modified

- src/repositories/UserRepository.ts — Added UserRepository interface
- src/repositories/InMemoryUserRepository.ts — Implemented in-memory store

## Commands Run

(none yet — run validation commands above)

## Fixes Applied

(populated by fix-build-errors.md if needed)

## Blockers

(none)
```

Update `state.json`:
- Set `phases.sdd-apply.status` to `"in_progress"` (NOT `"complete"` — apply is done in batches)
- Update `updatedAt`

Only set `sdd-apply` to `"complete"` when ALL tasks in `05-tasks.md` are marked done.

---

## Hard Constraints

- **NEVER implement more than 4 files per batch** — split into smaller batches if needed.
- **NEVER implement before spec, design, and tasks all exist** and were read in Step 2.
- **NEVER skip updating `06-apply-progress.md`** — it is the audit trail.
- **NEVER invent APIs, classes, config keys, or types** — inspect the repo first. If something is unclear, ask.
- **NEVER modify protected files**: `.env`, `*.key`, `*.pem`, `*.pfx`, `secrets.*`, `appsettings.Production.json`, `*.p12`, `*.crt` (CA-issued).
- **NEVER use braces-optional style** — always use braces in C#, Java, JavaScript, TypeScript.
- **NEVER start a task if its dependencies are not complete** — recheck the task graph.
- **If a task reveals unexpected complexity**: document the blocker in `06-apply-progress.md` under "Blockers", stop, and report to the user. Do NOT guess or improvise architecture.
- **NEVER implement code that contradicts `03-spec.md` or `04-design.md`** — if a conflict is found, stop and report.

---

## Expected Outputs

| File | When updated |
|------|-------------|
| Modified source files (max 4) | Step 4 |
| `.ai-workflows/sdd/changes/<name>/06-apply-progress.md` | Step 6 |
| `.ai-workflows/sdd/changes/<name>/state.json` | Step 6 |
