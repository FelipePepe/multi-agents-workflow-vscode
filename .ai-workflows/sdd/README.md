# Spec-Driven Development (SDD)

> **No code without a spec. No spec without an explore. No deploy without a verify.**

SDD is a multi-agent workflow that enforces a rigorous, artifact-first development process. Every change moves through defined phases, each producing a durable artifact. Agents read prior artifacts before producing their own — ensuring every implementation decision traces back to a verified requirement.

---

## Why SDD?

Code written without a spec is a liability. SDD solves this by:

- **Preventing scope creep** — Out-of-scope work is explicitly declared before coding starts.
- **Making decisions auditable** — Every architectural choice has a rationale in writing.
- **Enabling safe multi-agent collaboration** — Agents share context through structured artifacts, not conversation history.
- **Catching problems early** — A flaw found in the Spec phase costs 10× less than one found in Verify.

---

## The 8 Phases

| # | Phase | Agent | Model | Reads | Writes |
|---|-------|-------|-------|-------|--------|
| 01 | **Explore** | Explorer | qwen3.6:35b-a3b | codebase | `01-explore.md` |
| 02 | **Proposal** | Proposal | deepseek-r1:70b | `01-explore.md` | `02-proposal.md` |
| 03 | **Spec** | Spec | qwen3-coder-next | `01-explore.md`, `02-proposal.md` | `03-spec.md` |
| 04 | **Design** | Design | deepseek-r1:70b | `01-explore.md`, `02-proposal.md`, `03-spec.md` | `04-design.md` |
| 05 | **Tasks** | Tasks | qwen3-coder-next | `03-spec.md`, `04-design.md` | `05-tasks.md` |
| 06 | **Apply** | Implementer / Tester | qwen3-coder-next | `04-design.md`, `05-tasks.md` | code + `06-apply-progress.md` |
| 07 | **Verify** | Verifier | deepseek-r1:70b | all prior artifacts + code | `07-verify-report.md` |
| 08 | **Archive** | Archiver | north-mini-code-1.0 | `07-verify-report.md`, code | `08-archive-report.md` |

### What Each Phase Produces

1. **Explore** — A snapshot of the repository: stack, patterns, relevant files, risks, unknowns. Ground truth for all subsequent phases.
2. **Proposal** — A concrete recommendation: what to build, what alternatives were rejected, what files are affected. No implementation yet.
3. **Spec** — Formal requirements (MUST/SHOULD/MAY per RFC 2119), acceptance criteria, edge cases, and explicit out-of-scope declarations.
4. **Design** — Component responsibilities, data flows, interface contracts, failure modes, security and performance decisions.
5. **Tasks** — Ordered, dependency-aware task checklist mapping spec ACs to concrete file changes with validation commands.
6. **Apply** — The only phase where code is written. Implementer executes tasks; Tester adds tests. Progress is tracked continuously.
7. **Verify** — Independent agent checks spec compliance, build, tests, security, and code quality. Emits PASS / PASS_WITH_WARNINGS / FAIL.
8. **Archive** — Final summary, PR description, known limitations, lessons learned. Written only after a PASS verdict.

---

## Artifact Store Structure

All artifacts for a change live under:

```
.ai-workflows/sdd/changes/<change-name>/
├── 01-explore.md
├── 02-proposal.md
├── 03-spec.md
├── 04-design.md
├── 05-tasks.md
├── 06-apply-progress.md
├── 07-verify-report.md
├── 08-archive-report.md
└── state.json
```

`<change-name>` is always **kebab-case**, e.g. `user-auth-refresh`, `export-csv-endpoint`.

---

## state.json

Every change has a `state.json` that the orchestrator reads and writes to track progress across sessions.

```json
{
  "change": "user-auth-refresh",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T14:32:00Z",
  "current_phase": "verify",
  "phases": {
    "explore":   { "status": "complete", "completed_at": "2024-01-15T10:15:00Z" },
    "proposal":  { "status": "complete", "completed_at": "2024-01-15T10:45:00Z" },
    "spec":      { "status": "complete", "completed_at": "2024-01-15T11:20:00Z" },
    "design":    { "status": "complete", "completed_at": "2024-01-15T12:00:00Z" },
    "tasks":     { "status": "complete", "completed_at": "2024-01-15T12:30:00Z" },
    "apply":     { "status": "complete", "completed_at": "2024-01-15T14:00:00Z" },
    "verify":    { "status": "in_progress" },
    "archive":   { "status": "pending" }
  },
  "review_loop_iteration": 1,
  "verdict": null,
  "blockers": []
}
```

**Status values:** `pending` → `in_progress` → `complete` | `blocked` | `failed`

---

## The Multi-Model Review Loop

After Apply completes, the workflow enters a review loop:

```
Apply → Verify (deepseek-r1:70b)
           │
           ├── PASS ──────────────────────────────→ Archive
           │
           ├── PASS_WITH_WARNINGS ─────────────────→ Archive (warnings documented)
           │
           └── FAIL ──→ Implementer fixes issues ──→ Verify (iteration + 1)
                                                        │
                                                        └── Max 3 iterations before
                                                            escalating to human
```

The Verifier is always a different model from the Implementer. This deliberate model diversity catches blind spots: a reasoning model (deepseek-r1) reviews code written by a coding model (qwen3-coder-next).

---

## Starting a New Change

### Via the SDD orchestrator (recommended)

```
sdd new <change-name>
```

This creates the change directory, initializes `state.json`, and launches the Explorer agent.

### Manually

```bash
# 1. Create the change directory
mkdir -p .ai-workflows/sdd/changes/<change-name>

# 2. Initialize state.json
cp .ai-workflows/sdd/templates/state.json.example .ai-workflows/sdd/changes/<change-name>/state.json

# 3. Copy the explore template and start filling it
cp .ai-workflows/sdd/templates/explore.md .ai-workflows/sdd/changes/<change-name>/01-explore.md
```

### Resuming an In-Progress Change

```
sdd continue <change-name>
```

The orchestrator reads `state.json`, finds the current phase, and resumes from where it left off.

---

## Templates

Each template is a Markdown file with `<!-- placeholder comments -->` for agents to fill in.

| Phase | Template |
|-------|----------|
| 01 Explore | [templates/explore.md](templates/explore.md) |
| 02 Proposal | [templates/proposal.md](templates/proposal.md) |
| 03 Spec | [templates/spec.md](templates/spec.md) |
| 04 Design | [templates/design.md](templates/design.md) |
| 05 Tasks | [templates/tasks.md](templates/tasks.md) |
| 06 Apply Progress | [templates/apply-progress.md](templates/apply-progress.md) |
| 07 Verify Report | [templates/verify-report.md](templates/verify-report.md) |
| 08 Archive Report | [templates/archive-report.md](templates/archive-report.md) |

---

## Key Rules

1. **No agent skips phases.** Even trivial changes must complete Explore and Proposal.
2. **Artifacts are immutable once the next phase starts.** Amendments require a new entry at the bottom of the file.
3. **The Verifier never modifies code.** It emits findings; the Implementer fixes them.
4. **Out-of-scope work discovered during Apply is deferred**, not implemented. It becomes a follow-up task in the Archive.
5. **A FAIL verdict after 3 iterations escalates to the human.** No infinite loops.
