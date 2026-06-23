# Continue an Active SDD Change

**Purpose**: Resumes an in-progress SDD change at the next incomplete phase. Validates prerequisites, executes exactly one phase using the correct model, writes the output artifact, and updates state.

**Model / Agent role**: `qwen3.6:35b-a3b` — Orchestrator (dispatches to phase-specific models as specified in `models.json`)

**Use in**: Claude Code, Cline, Continue, OpenCode, Codex

---

## Step 1 — Identify the change

If the user has provided a change name, use it.

If not, list the available changes:

```
.ai-workflows/sdd/changes/
```

Print each change name with its current phase and status from `state.json`. Example:

```
Available changes:
  add-user-auth        → currentPhase: sdd-spec       (explore ✓, propose ✓, spec pending)
  fix-rate-limiter     → currentPhase: sdd-apply       (all planning ✓, apply in progress)
  migrate-pg-schema    → currentPhase: sdd-verify      (apply ✓, verify pending)
```

Ask the user which change to continue. Wait for their response.

---

## Step 2 — Read state

Read: `.ai-workflows/sdd/changes/<name>/state.json`

Print the current phase status as a table:

| Phase | Status | Artifact |
|-------|--------|----------|
| sdd-explore | complete | 01-explore.md |
| sdd-propose | complete | 02-proposal.md |
| sdd-spec | pending | — |
| sdd-design | pending | — |
| sdd-tasks | pending | — |
| sdd-apply | pending | — |
| sdd-verify | pending | — |
| sdd-archive | pending | — |

Identify the `currentPhase` (first phase with status `pending` or `in_progress`).

---

## Step 3 — Read workflow configuration

Read both config files before proceeding:

- `.ai-workflows/config/models.json` — model and agent role per phase.
- `.ai-workflows/config/workflow.json` — phase order and prerequisite phases.

Use these as the authoritative source. Do NOT hardcode phase dependencies.

---

## Step 4 — Validate prerequisites

Check that every phase listed as a prerequisite for `currentPhase` in `workflow.json` has status `"complete"` in `state.json`.

If any prerequisite is missing:
- Stop immediately.
- Tell the user: "Cannot run `<currentPhase>` because `<missing-phase>` is not complete. Run that phase first using this same prompt."
- Do NOT proceed.

---

## Step 5 — Execute the current phase

Read the template for the current phase from: `.ai-workflows/sdd/templates/`

Use the model and agent role from `models.json` for this phase.

### Phase: `sdd-propose`
- Model: `deepseek-r1:70b`
- Read: `01-explore.md`
- Produce: `02-proposal.md`
- Content: change intent, problem statement, proposed approach, scope boundaries (in scope / out of scope), risks and mitigations, open questions for spec phase.

### Phase: `sdd-spec`
- Model: `qwen3-coder-next`
- Read: `01-explore.md`, `02-proposal.md`
- Produce: `03-spec.md`
- Content: functional requirements, acceptance criteria (Given/When/Then format), edge cases, non-functional requirements, data contracts (inputs/outputs/schemas), API contracts if applicable.

### Phase: `sdd-design`
- Model: `deepseek-r1:70b`
- Read: `01-explore.md`, `02-proposal.md`, `03-spec.md`
- Produce: `04-design.md`
- Content: architecture decisions (with rationale), component breakdown, data flow diagrams (ASCII or Mermaid), interface definitions, patterns and conventions to follow, files to create/modify/delete.

### Phase: `sdd-tasks`
- Model: `qwen3-coder-next`
- Read: `03-spec.md`, `04-design.md`
- Produce: `05-tasks.md`
- Content: ordered checklist of atomic implementation tasks. Each task must have: ID, description, files affected (max 4), dependencies on other task IDs, acceptance test, estimated complexity (S/M/L).

### Phase: `sdd-apply`
- Model: `qwen3-coder-next`
- Read: `03-spec.md`, `04-design.md`, `05-tasks.md`, `06-apply-progress.md` (if it exists)
- Produce / update: `06-apply-progress.md`
- Behavior: implement ONE small batch of pending tasks (max 4 files). For details, use the `implement-task-batch.md` prompt — this phase delegates to the Implementer role.

### Phase: `sdd-verify`
- Model: `deepseek-r1:70b`
- Read: all artifacts (`01` through `06`) + build/test logs if present
- Produce: `07-verify-report.md`
- Behavior: for details, use the `verify-current-change.md` prompt — this phase delegates to the Verifier role.

### Phase: `sdd-archive`
- Model: `north-mini-code-1.0`
- Read: all artifacts (`01` through `07`)
- Produce: `08-archive-report.md`
- Content: final summary, lessons learned, list of all files changed, verification verdict, link to PR or commit if applicable. Mark all phases `"archived"` in `state.json`.

---

## Step 6 — Write the artifact and update state

After completing the phase:

1. Write the output file to `.ai-workflows/sdd/changes/<name>/<artifact>`.
2. Update `state.json`:
   - Set `phases.<currentPhase>.status` to `"complete"`
   - Set `phases.<currentPhase>.completedAt` to current ISO timestamp
   - Set `currentPhase` to the next phase name from `workflow.json`
   - Set `artifacts.<phase>` to the artifact filename
   - Update `updatedAt`

---

## Step 7 — Report to user

Print a short summary:

```
Phase complete: sdd-spec
Artifact written: 03-spec.md

Key outputs:
  - X acceptance criteria defined
  - Y edge cases documented
  - Z data contracts specified

Next phase: sdd-design
Run this prompt again, or use implement-task-batch.md after tasks are ready.
```

---

## Hard Constraints

- **NEVER run more than one phase per invocation** — one prompt call = one phase.
- **NEVER skip prerequisite validation** before executing a phase.
- **NEVER write application code** in the orchestrator role — delegate to the Implementer for `sdd-apply`.
- **NEVER update `state.json`** until the artifact has been successfully written.
- **NEVER assume phase models or dependencies** — always read config files first.
- **NEVER mark a phase complete** if the artifact was not written.

---

## Expected Outputs (per phase)

| Phase | Artifact written | state.json updated |
|-------|-----------------|-------------------|
| sdd-propose | `02-proposal.md` | yes |
| sdd-spec | `03-spec.md` | yes |
| sdd-design | `04-design.md` | yes |
| sdd-tasks | `05-tasks.md` | yes |
| sdd-apply | `06-apply-progress.md` | yes |
| sdd-verify | `07-verify-report.md` | yes |
| sdd-archive | `08-archive-report.md` | yes |
