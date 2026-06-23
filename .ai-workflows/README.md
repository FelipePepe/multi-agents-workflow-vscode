# Multi-Agent SDD Workflow

This workflow implements Spec-Driven Development (SDD) using a team of specialized AI agents, each assigned a focused role and a model tuned for that role. It exists to solve a fundamental problem with AI-assisted development: when a single model handles everything — exploration, design, implementation, and validation — it tends to shortcut the planning phases and ship unreviewed code. This workflow enforces structured phases, prevents code from being written before a spec exists, and improves output quality by running verification through a different model than the one that implemented the change. By default, all models run locally via Ollama — no cloud required.

## What This Workflow Does

- Enforces a structured 8-phase SDD cycle before any code is written
- Assigns each phase to a specialized agent with a model optimized for that task
- Prevents the implementer from running without an approved spec and design
- Limits implementation batches to 4 files maximum to avoid big-bang changes
- Validates every change with build, test, and lint commands specific to the detected stack
- Runs verification through a separate agent (not the implementer) to catch regressions
- Archives all planning artifacts alongside code so the "why" is never lost
- Works with any AI tool that accepts a text prompt: Claude Code, Cline, Continue, OpenCode, Codex, or Copilot Chat
- Runs 100% locally via Ollama — no API keys, no cloud spend required by default
- Supports .NET, Java, Node.js/TypeScript, Python, SQL, and generic stacks out of the box

## Theoretical Foundation

This workflow is a structured implementation of the AI loop model. For the theory behind why it is designed this way — the role of the verification gate, the maker/checker separation, state management, stop conditions, convergence failure, and why local inference changes the cost calculus — read:

**[`.ai-workflows/docs/loop-foundations.md`](docs/loop-foundations.md)**

The short version: a loop without a deterministic gate is an LLM agreeing with itself on repeat. The gate here is `run-validation.sh` — binary, not LLM-judged.

---

## Architecture: The Multi-Model Approach

A single large model is a generalist. It can write code, reason about architecture, and catch bugs — but not all with equal depth in the same context window. Specialization matters: reasoning-heavy models (deepseek-r1:70b) are better at design trade-offs and verification; code-focused models (qwen3-coder-next, devstral-small-2) are faster and more precise for implementation and testing; a small model (north-mini-code-1.0) is efficient for archiving structured data. This workflow routes each phase to the right tool.

| Agent | Model | Role |
|-------|-------|------|
| Orchestrator | qwen3.6:35b-a3b | Manages phase sequencing, reads state.json, decides what runs next |
| Explorer | qwen3.6:35b-a3b | Maps the codebase, identifies affected files and entry points |
| Proposal | deepseek-r1:70b | Reasons about intent, scope, and approach before any spec is written |
| Spec | qwen3-coder-next | Writes detailed requirements and acceptance scenarios for the change |
| Design | deepseek-r1:70b | Produces architecture decisions, interface contracts, and data flow |
| Tasks | qwen3-coder-next | Breaks the design into a numbered, dependency-ordered task checklist |
| Implementer | qwen3-coder-next | Writes code in batches of ≤4 files, strictly following spec and design |
| Tester | devstral-small-2 | Writes or updates unit and integration tests for each implemented batch |
| Verifier | deepseek-r1:70b | Independently reviews implementation against spec, design, and task list |
| Fixer | devstral-small-2 | Resolves compiler errors and test failures without changing architecture |
| Archiver | north-mini-code-1.0 | Writes the archive report and updates state.json to mark change complete |

## The 8 SDD Phases

| Phase | Agent | Reads | Writes | Purpose |
|-------|-------|-------|--------|---------|
| 1 — Explore | Explorer | codebase, git log | 01-explore.md | Map affected files, understand current structure |
| 2 — Propose | Proposal | 01-explore.md | 02-proposal.md | Define intent, scope, and high-level approach |
| 3 — Spec | Spec | 02-proposal.md, codebase | 03-spec.md | Write requirements and acceptance scenarios |
| 4 — Design | Design | 03-spec.md, 01-explore.md | 04-design.md | Architecture decisions, interfaces, data flow |
| 5 — Tasks | Tasks | 04-design.md, 03-spec.md | 05-tasks.md | Numbered task checklist, ordered by dependency |
| 6 — Apply | Implementer + Tester | 05-tasks.md, 04-design.md, 03-spec.md | 06-apply-progress.md + code | Implement in ≤4 file batches, write tests per batch |
| 7 — Verify | Verifier | 03-spec.md, 04-design.md, 05-tasks.md, code | 07-verify-report.md | Independent review — passes or returns to Apply |
| 8 — Archive | Archiver | all artifacts | 08-archive-report.md, state.json | Document decisions, mark change complete |

**Phase 1 — Explore**: The Explorer reads the codebase without writing any code. Its only output is a map: which files are affected, what the current structure looks like, and what dependencies exist. This prevents the implementer from making assumptions later.

**Phase 2 — Propose**: The Proposal agent reasons about what the change should accomplish, why, and at what scope. It proposes an approach but does not specify interfaces or write code. This is the gate where vague requests become concrete intent.

**Phase 3 — Spec**: The Spec agent translates the proposal into precise, testable requirements. Each requirement has an acceptance scenario. No implementation starts without a signed-off spec.

**Phase 4 — Design**: The Design agent turns the spec into an architecture. It defines interfaces, data contracts, module boundaries, and documents trade-offs. The Implementer cannot deviate from the design without explicit approval in 04-design.md.

**Phase 5 — Tasks**: The Tasks agent produces a numbered checklist ordered by dependency. Each task maps to specific files and references the relevant spec scenarios. This is the Implementer's execution plan.

**Phase 6 — Apply**: The Implementer and Tester run in alternating batches of ≤4 files. After each batch, 06-apply-progress.md is updated. Skipped tests must be documented. Compiler errors route to the Fixer, not the Implementer.

**Phase 7 — Verify**: A different model (deepseek-r1:70b) reviews the implementation against the spec and design. It either passes the change or returns it to Apply with specific findings. No self-approval.

**Phase 8 — Archive**: The Archiver writes a structured archive report summarizing the change, decisions made, and deviations from the original design. It marks state.json as complete.

## Prerequisites

### Hardware
- NVIDIA DGX Spark or equivalent (128GB+ unified memory recommended for running concurrent models)
- Minimum 32GB RAM for running a single 35b model in Q4
- Ollama installed and running

### Software
- Ollama: https://ollama.ai
- VS Code with recommended extensions (see `.vscode/extensions.json`)
- bash (Linux/macOS) or PowerShell 5.1+ (Windows)
- Optional: `jq` for JSON parsing in scripts

## Installing Ollama Models

```bash
# Check which models you already have
bash .ai-workflows/scripts/ollama-check-models.sh

# Pull all required models individually
ollama pull qwen3.6:35b-a3b
ollama pull qwen3-coder-next
ollama pull deepseek-r1:70b
ollama pull devstral-small-2
ollama pull north-mini-code-1.0
ollama pull qwen2.5-coder:32b

# Or check and pull all at once
bash .ai-workflows/scripts/ollama-check-models.sh --pull
```

## Quick Start: Your First Change

1. **Start the change** — Open `.ai-workflows/prompts/start-sdd-change.md` and paste its content into your AI tool (Claude Code, Cline, Continue, OpenCode, or Codex)
2. **Let the orchestrator plan** — It will run explore → propose → spec → design → tasks sequentially before writing any code
3. **Implement in batches** — Use `.ai-workflows/prompts/implement-task-batch.md` for each batch of ≤4 files
4. **Validate** — Run VS Code task `SDD: Run Validation` to execute build, test, and lint
5. **Verify** — Use `.ai-workflows/prompts/verify-current-change.md` for independent review
6. **Fix** — Use `.ai-workflows/prompts/fix-build-errors.md` if the build or tests fail
7. **Archive** — Run VS Code task `SDD: Archive Change` to close out the change

## Recommended Local Workflow

```
1. Start change:    paste .ai-workflows/prompts/start-sdd-change.md into AI tool
2. Plan phases:     let orchestrator run explore/propose/spec/design/tasks
3. Implement:       paste .ai-workflows/prompts/implement-task-batch.md
4. Validate:        VS Code task: SDD: Run Validation
5. Verify:          paste .ai-workflows/prompts/verify-current-change.md
6. Fix:             paste .ai-workflows/prompts/fix-build-errors.md
7. Archive:         VS Code task: SDD: Archive Change
```

## VS Code Tasks Reference

| Task Name | What It Does | How to Run |
|-----------|--------------|------------|
| SDD: Detect Stack | Runs stack detection and prints detected build/test commands | Terminal > Run Task > SDD: Detect Stack |
| SDD: Check Ollama Models | Verifies all required models are available in Ollama | Terminal > Run Task > SDD: Check Ollama Models |
| SDD: Run Build | Runs the build command for the detected stack | Terminal > Run Task > SDD: Run Build |
| SDD: Run Tests | Runs the test command for the detected stack | Terminal > Run Task > SDD: Run Tests |
| SDD: Run Validation | Runs build + tests + lint in sequence, saves logs | Terminal > Run Task > SDD: Run Validation |
| SDD: Start New Change | Creates the change directory and opens the orchestrator prompt | Terminal > Run Task > SDD: Start New Change |
| SDD: Continue Change | Resumes an in-progress change from where it left off | Terminal > Run Task > SDD: Continue Change |
| SDD: Verify Change | Opens the verify prompt for the current active change | Terminal > Run Task > SDD: Verify Change |
| SDD: Archive Change | Runs the archive agent and closes the active change | Terminal > Run Task > SDD: Archive Change |
| SDD: Open Workflow README | Opens this README in VS Code | Terminal > Run Task > SDD: Open Workflow README |

## Integration with AI Tools

### Claude Code (CLI)
```bash
# Print the prompt file and use it as your session context
cat .ai-workflows/prompts/start-sdd-change.md
# Then paste the output as your first message in the Claude Code session
```

### Cline / Roo Code (VS Code Extension)
- Set the model to `qwen3.6:35b-a3b` for orchestration phases
- Open the relevant prompt file from `.ai-workflows/prompts/`
- Paste its content into Cline's task input
- Switch models per phase as specified in `config/models.json`

### Continue (VS Code Extension)
- Model configuration is already set in `.vscode/settings.json`
- Use `@file .ai-workflows/prompts/start-sdd-change.md` to inject the prompt as context
- Switch between models per phase using Continue's model selector

### OpenCode (Terminal)
```bash
opencode --model qwen3.6:35b-a3b --file .ai-workflows/prompts/start-sdd-change.md
```

### GitHub Copilot Chat
- Copy the content of the relevant prompt file into Copilot Chat's input
- Copilot Chat uses GitHub-hosted models rather than local Ollama — use only if cloud inference is acceptable for your project
- Note: model assignments in `config/models.json` do not apply to Copilot Chat

### Codex / OpenAI Codex
- Use the prompt files as system prompts
- Point Codex to Ollama's OpenAI-compatible endpoint: `http://localhost:11434/v1`
- Set model name to match the Ollama model tag (e.g., `qwen3.6:35b-a3b`)

## Customizing Model Assignments

Edit `.ai-workflows/config/models.json` to reassign any agent to a different model:

```json
{
  "models": {
    "implementer": "your-preferred-model"
  }
}
```

All agent prompt files in `.ai-workflows/agents/` reference `models.json` — there is no need to update agent files individually.

## Disabling Cloud Models

Cloud models are disabled by default. The relevant flag in `config/models.json`:

```json
{ "cloud": { "enabled": false } }
```

To enable cloud inference for specific agents, set `enabled: true` and configure a provider with an API key under the `cloud` key.

## Adding Project-Specific Coding Rules

Create `.ai-workflows/rules/<stack>.md` (e.g., `rules/dotnet.md`, `rules/node.md`) with your project-specific conventions, naming rules, or architectural constraints. Reference it from the Implementer by adding this line to `implement-task-batch.md`:

```
Also read .ai-workflows/rules/<stack>.md and apply all rules defined there.
```

## SDD Artifact Store

```
.ai-workflows/sdd/changes/
  <change-name>/
    01-explore.md        ← Explorer agent output
    02-proposal.md       ← Proposal agent output
    03-spec.md           ← Spec agent output
    04-design.md         ← Design agent output
    05-tasks.md          ← Tasks agent output
    06-apply-progress.md ← Implementer and Tester progress log
    07-verify-report.md  ← Verifier agent report
    08-archive-report.md ← Archiver agent final report
    state.json           ← Orchestrator phase tracking
```

## Quality Rules

> These rules exist to prevent the most common AI-assisted development failures.

- **No code without spec.** If `03-spec.md` does not exist, the Implementer does not run.
- **No big-bang implementation.** Maximum 4 files per batch. Always.
- **No hallucinated APIs.** Every class, method, and package used must exist in the repo or in declared dependencies.
- **No ignoring compiler errors.** The Fixer agent handles errors; the Implementer does not ship broken code.
- **No skipping tests silently.** If tests are skipped, the reason must be documented in `06-apply-progress.md`.
- **No modifying secrets.** `.env`, `*.key`, `*.pem`, `appsettings.Production.json` are always protected.
- **No destructive commands.** Scripts never delete files, drop tables, or run force-push.
- **No single-agent approval.** The Verifier is always a different agent (and model) than the Implementer.
- **No architectural rewrite without design approval.** If `04-design.md` does not explicitly approve the change, the Implementer does not make it.
- **Always prefer small patches.** Diff-style changes over full file rewrites.
- **Always update progress artifacts.** `06-apply-progress.md` is updated after every task, not just at the end.
- **Always keep validation logs.** Logs are never deleted — only appended.

## Supported Stacks

| Stack | Detection | Build | Test | Lint |
|-------|-----------|-------|------|------|
| .NET / C# | `*.csproj`, `*.sln` | `dotnet build` | `dotnet test` | — |
| Java (Maven) | `pom.xml` | `mvn compile` | `mvn test` | — |
| Java (Gradle) | `build.gradle` | `./gradlew build` | `./gradlew test` | — |
| Node.js / TypeScript | `package.json` | `npm run build` | `npm test` | `npm run lint` |
| Python | `requirements.txt`, `pyproject.toml` | — | `pytest` | `ruff`, `mypy` |
| SQL / PL-SQL | `*.sql` | — | — | — |
| Generic | (fallback) | — | — | — |

## Project Structure

```
.ai-workflows/
  README.md               ← You are here
  agents/                 ← Agent system prompts (11 agents)
  sdd/
    README.md             ← SDD phase reference
    templates/            ← Artifact templates (8 templates)
    changes/              ← Active and archived changes
  prompts/                ← Copy-paste prompts for AI tools
  config/
    models.json           ← Model assignments per agent
    workflow.json         ← Phase definitions and rules
    validation.json       ← Stack detection and commands
  scripts/                ← Bash scripts (Linux/macOS)
    windows/              ← PowerShell scripts (Windows)
  logs/                   ← Build, test, lint logs (git-ignored)
.vscode/
  tasks.json              ← VS Code task runner integration
  settings.json           ← AI tool configuration (Continue, Cline)
  extensions.json         ← Recommended extensions
```
