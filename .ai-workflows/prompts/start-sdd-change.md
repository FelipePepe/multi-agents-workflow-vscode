# Start a New SDD Change

**Purpose**: Initiates the SDD workflow for a new change request. Creates the change directory, runs the Explorer agent, and optionally fast-forwards through all planning phases before implementation.

**Model / Agent role**: `qwen3.6:35b-a3b` — Orchestrator

**Use in**: Claude Code, Cline, Continue, OpenCode, Codex

---

## Step 1 — Determine the change name

If the user has not provided a change name, infer one from the request using kebab-case, all lowercase, descriptive (e.g., `add-user-auth`, `migrate-postgres-schema`, `fix-rate-limiter`).

If you are not confident in the inferred name, ask:

> "I'll name this change `<inferred-name>`. Confirm or provide a different name."

Wait for confirmation before continuing.

---

## Step 2 — Check for existing directory

Check whether `.ai-workflows/sdd/changes/<change-name>/` already exists.

If it EXISTS:
- Stop immediately.
- Tell the user: "A change named `<change-name>` already exists. Do you want to overwrite it? This will reset all phase state."
- Wait for explicit confirmation (`yes` / `overwrite` / `confirm`) before proceeding.
- Do NOT delete or overwrite without explicit user approval.

---

## Step 3 — Ask about fast-forward mode

Ask the user:

> "Do you want to fast-forward through all planning phases (explore → propose → spec → design → tasks) before implementing, or stop after the explore phase so you can review before continuing?"
>
> - **Yes / fast-forward**: run all 5 planning phases now in sequence.
> - **No / stop after explore**: run only the explore phase, then pause.

Wait for the user's answer before continuing.

---

## Step 4 — Read workflow configuration

Before doing any work, read both config files:

- `.ai-workflows/config/models.json` — maps each phase to its model and agent role.
- `.ai-workflows/config/workflow.json` — defines phase order and prerequisites.

Use these files as the authoritative source for which model to use per phase and what order phases must run in. Do NOT rely on hardcoded assumptions.

---

## Step 5 — Create the change directory and initial state

Create the directory: `.ai-workflows/sdd/changes/<change-name>/`

Create `.ai-workflows/sdd/changes/<change-name>/state.json` with this structure:

```json
{
  "changeName": "<change-name>",
  "createdAt": "<ISO 8601 timestamp>",
  "updatedAt": "<ISO 8601 timestamp>",
  "currentPhase": "sdd-explore",
  "fastForward": <true|false>,
  "phases": {
    "sdd-explore":  { "status": "pending", "startedAt": null, "completedAt": null },
    "sdd-propose":  { "status": "pending", "startedAt": null, "completedAt": null },
    "sdd-spec":     { "status": "pending", "startedAt": null, "completedAt": null },
    "sdd-design":   { "status": "pending", "startedAt": null, "completedAt": null },
    "sdd-tasks":    { "status": "pending", "startedAt": null, "completedAt": null },
    "sdd-apply":    { "status": "pending", "startedAt": null, "completedAt": null },
    "sdd-verify":   { "status": "pending", "startedAt": null, "completedAt": null },
    "sdd-archive":  { "status": "pending", "startedAt": null, "completedAt": null }
  },
  "verifyVerdict": null,
  "artifacts": {}
}
```

---

## Step 6 — Run the Explorer phase

Read the template: `.ai-workflows/sdd/templates/explore.md`

Perform a structured repository exploration:

1. Read the root directory listing to understand the project layout.
2. Read `package.json`, `pyproject.toml`, `*.csproj`, `Cargo.toml`, or equivalent — identify the stack and main dependencies.
3. Identify entry points (e.g., `src/main.*`, `index.*`, `Program.cs`, `app.py`).
4. Find files directly relevant to the change request (search by keyword, module name, or domain concept).
5. Identify test infrastructure: test framework, test directory conventions.
6. Identify build/lint/CI tooling: scripts, `.github/workflows/`, Makefile targets.
7. Note any existing patterns or conventions that the change must follow.

Write the output to: `.ai-workflows/sdd/changes/<change-name>/01-explore.md`

The output must follow the structure defined in the explore template. Include:
- Repository overview (stack, runtime, package manager)
- Relevant files and their purpose
- Existing patterns the change must respect
- Open questions for the proposal phase

Update `state.json`:
- Set `phases.sdd-explore.status` to `"complete"`
- Set `phases.sdd-explore.completedAt` to current ISO timestamp
- Set `currentPhase` to `"sdd-propose"`
- Set `artifacts.explore` to `"01-explore.md"`
- Update `updatedAt`

---

## Step 7 — Fast-forward or pause

**If fast-forward = NO:**

Stop here. Print a summary of what the explore phase found (key files, detected stack, open questions). Then ask:

> "Explore phase complete. Review `01-explore.md` and run `continue-sdd-change.md` to proceed to the proposal phase, or tell me to continue now."

**If fast-forward = YES:**

Continue sequentially through each remaining planning phase:
- `sdd-propose` → write `02-proposal.md`
- `sdd-spec` → write `03-spec.md`
- `sdd-design` → write `04-design.md`
- `sdd-tasks` → write `05-tasks.md`

For each phase:
1. Read all previously produced artifacts as input.
2. Read the corresponding template from `.ai-workflows/sdd/templates/`.
3. Use the model specified in `models.json` for that phase.
4. Write the output artifact.
5. Update `state.json` (phase status, completedAt, artifact path, currentPhase).

After all 5 planning phases complete, print a summary table:

| Phase | Artifact | Status |
|-------|----------|--------|
| Explore | 01-explore.md | complete |
| Propose | 02-proposal.md | complete |
| Spec | 03-spec.md | complete |
| Design | 04-design.md | complete |
| Tasks | 05-tasks.md | complete |

Then say:

> "All planning phases complete. Run `implement-task-batch.md` to begin implementation."

---

## Hard Constraints

- **NEVER write application code** in this prompt. This is a planning-only workflow.
- **NEVER skip the explore phase** — it is always the first phase, regardless of fast-forward mode.
- **NEVER create the change directory** without first checking for existence.
- **NEVER overwrite an existing change** without explicit user confirmation.
- **NEVER assume phase models** — always read `models.json` first.
- **NEVER assume phase dependencies** — always read `workflow.json` first.
- **NEVER proceed past a phase** without writing the artifact and updating `state.json`.

---

## Expected Outputs

| File | When created |
|------|-------------|
| `.ai-workflows/sdd/changes/<name>/state.json` | Step 5 |
| `.ai-workflows/sdd/changes/<name>/01-explore.md` | Step 6 |
| `.ai-workflows/sdd/changes/<name>/02-proposal.md` | Step 7 (fast-forward only) |
| `.ai-workflows/sdd/changes/<name>/03-spec.md` | Step 7 (fast-forward only) |
| `.ai-workflows/sdd/changes/<name>/04-design.md` | Step 7 (fast-forward only) |
| `.ai-workflows/sdd/changes/<name>/05-tasks.md` | Step 7 (fast-forward only) |
